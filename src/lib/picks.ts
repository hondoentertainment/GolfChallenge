import { query, queryOne, execute } from './db';
import { v4 as uuidv4 } from 'uuid';
import { CHALLENGE_SEASON, CHALLENGE_TOURNAMENTS_START_ON_OR_AFTER } from './challenge-season';
import { getLeagueMembers } from './leagues';
import { getPickDeadline, calculatePrizeMoney, parsePosition, allocatePurseByFinishPositions, syncTournamentPursesFromSchedule } from './pga-schedule';
import {
  PRIZE_SOURCE_TIE_TABLE,
  type PrizeMoneySource,
} from './prize-money-db';
import {
  applyPublishedPayoutComplianceForTournament,
  hasPublishedPayoutTable,
} from './published-payout-compliance';
import { logAction } from './audit';

export interface Pick {
  id: string;
  league_id: string;
  user_id: string;
  tournament_id: string;
  golfer_id: string;
  picked_at: string;
  pick_order: number;
  is_missed?: boolean;
}

export interface PickWithDetails extends Pick {
  username: string;
  golfer_name: string;
  tournament_name: string;
  prize_money: number;
  position: string | null;
  score: string | null;
}

export interface Tournament {
  id: string;
  name: string;
  start_date: string;
  end_date: string;
  course: string;
  location: string;
  purse: number;
  season: string;
  status: string;
  is_excluded: number;
}

export interface Golfer {
  id: string;
  name: string;
  world_ranking: number;
  country: string;
}

export async function getTournaments(season = CHALLENGE_SEASON): Promise<Tournament[]> {
  return query<Tournament>(
    `SELECT * FROM tournaments WHERE season = $1 AND is_excluded = 0
     AND (start_date::date) >= $2::date
     ORDER BY start_date ASC`,
    [season, CHALLENGE_TOURNAMENTS_START_ON_OR_AFTER],
  );
}

export async function getTournament(id: string): Promise<Tournament | null> {
  return queryOne<Tournament>('SELECT * FROM tournaments WHERE id = $1', [id]);
}

export async function getGolfers(): Promise<Golfer[]> {
  return query<Golfer>('SELECT * FROM golfers ORDER BY world_ranking ASC');
}

export async function getCurrentTournament(season = CHALLENGE_SEASON): Promise<Tournament | null> {
  const today = new Date().toISOString().split('T')[0];

  const active = await queryOne<Tournament>(
    `SELECT * FROM tournaments WHERE season = $1 AND is_excluded = 0
     AND (start_date::date) >= $4::date
     AND start_date <= $2 AND end_date >= $3 LIMIT 1`,
    [season, today, today, CHALLENGE_TOURNAMENTS_START_ON_OR_AFTER],
  );

  if (active) return active;

  const upcoming = await queryOne<Tournament>(
    `SELECT * FROM tournaments WHERE season = $1 AND is_excluded = 0
     AND (start_date::date) >= $3::date
     AND start_date > $2 ORDER BY start_date ASC LIMIT 1`,
    [season, today, CHALLENGE_TOURNAMENTS_START_ON_OR_AFTER],
  );

  return upcoming || null;
}

export async function getPickOrder(leagueId: string, tournamentId: string): Promise<{ userId: string; username: string; position: number; deadline: Date }[]> {
  const members = await getLeagueMembers(leagueId);
  const tournaments = await getTournaments();
  const tournamentIndex = tournaments.findIndex(t => t.id === tournamentId);
  const tournament = tournaments[tournamentIndex];

  if (!tournament || members.length === 0) return [];

  const memberCount = members.length;
  const rotation = tournamentIndex % memberCount;

  return members.map((member, i) => {
    const position = (i - rotation + memberCount) % memberCount;
    return {
      userId: member.user_id,
      username: member.username,
      position,
      deadline: getPickDeadline(position, tournament.start_date),
    };
  }).sort((a, b) => a.position - b.position);
}

export async function canUserPick(leagueId: string, userId: string, tournamentId: string): Promise<{ canPick: boolean; reason: string; deadline?: Date }> {
  const existingPick = await queryOne(
    'SELECT id FROM picks WHERE league_id = $1 AND user_id = $2 AND tournament_id = $3',
    [leagueId, userId, tournamentId]
  );

  if (existingPick) {
    return { canPick: false, reason: 'You have already made your pick for this tournament' };
  }

  const order = await getPickOrder(leagueId, tournamentId);
  const userOrder = order.find(o => o.userId === userId);

  if (!userOrder) {
    return { canPick: false, reason: 'You are not a member of this league' };
  }

  const now = new Date();

  for (const picker of order) {
    if (picker.position >= userOrder.position) break;

    const theirPick = await queryOne(
      'SELECT id FROM picks WHERE league_id = $1 AND user_id = $2 AND tournament_id = $3',
      [leagueId, picker.userId, tournamentId]
    );

    if (!theirPick && now < picker.deadline) {
      return {
        canPick: false,
        reason: `Waiting for ${picker.username} to pick (deadline: ${picker.deadline.toLocaleString('en-US', { timeZone: 'America/Los_Angeles' })})`,
        deadline: userOrder.deadline,
      };
    }
  }

  if (now > userOrder.deadline) {
    return { canPick: false, reason: 'Your pick deadline has passed', deadline: userOrder.deadline };
  }

  return { canPick: true, reason: 'Ready to pick', deadline: userOrder.deadline };
}

export async function makePick(leagueId: string, userId: string, tournamentId: string, golferId: string): Promise<Pick> {
  const golferTaken = await queryOne<{ id: string; username: string }>(
    'SELECT p.id, u.username FROM picks p JOIN users u ON p.user_id = u.id WHERE p.league_id = $1 AND p.tournament_id = $2 AND p.golfer_id = $3',
    [leagueId, tournamentId, golferId]
  );

  if (golferTaken) {
    throw new Error(`This golfer has already been picked by ${golferTaken.username}`);
  }

  const alreadyUsed = await queryOne<{ id: string; tournament_name: string }>(
    `SELECT p.id, t.name as tournament_name FROM picks p
     JOIN tournaments t ON p.tournament_id = t.id
     WHERE p.league_id = $1 AND p.user_id = $2 AND p.golfer_id = $3`,
    [leagueId, userId, golferId]
  );

  if (alreadyUsed) {
    throw new Error(`You already picked this golfer for ${alreadyUsed.tournament_name}. Each golfer can only be selected once per season.`);
  }

  const order = await getPickOrder(leagueId, tournamentId);
  const userOrder = order.find(o => o.userId === userId);
  const pickPosition = userOrder?.position ?? 0;

  const id = uuidv4();
  await execute(
    'INSERT INTO picks (id, league_id, user_id, tournament_id, golfer_id, pick_order) VALUES ($1, $2, $3, $4, $5, $6)',
    [id, leagueId, userId, tournamentId, golferId, pickPosition]
  );

  const golfer = await queryOne<{ name: string }>('SELECT name FROM golfers WHERE id = $1', [golferId]);
  const tournament = await queryOne<{ name: string }>('SELECT name FROM tournaments WHERE id = $1', [tournamentId]);
  await logAction('pick_made', `Picked ${golfer?.name} for ${tournament?.name}`, leagueId, userId);

  return {
    id,
    league_id: leagueId,
    user_id: userId,
    tournament_id: tournamentId,
    golfer_id: golferId,
    picked_at: new Date().toISOString(),
    pick_order: pickPosition,
  };
}

export async function getUserUsedGolfers(leagueId: string, userId: string): Promise<string[]> {
  const rows = await query<{ golfer_id: string }>(
    'SELECT golfer_id FROM picks WHERE league_id = $1 AND user_id = $2',
    [leagueId, userId]
  );
  return rows.map(r => r.golfer_id);
}

export async function getLeaguePicks(leagueId: string, tournamentId?: string): Promise<PickWithDetails[]> {
  let sql = `
    SELECT p.*, u.username, g.name as golfer_name, t.name as tournament_name,
      COALESCE(tr.prize_money, 0)::int as prize_money,
      tr.position,
      tr.score
    FROM picks p
    JOIN users u ON p.user_id = u.id
    JOIN golfers g ON p.golfer_id = g.id
    JOIN tournaments t ON p.tournament_id = t.id
      AND t.season = $2
      AND (t.start_date::date) >= $3::date
    LEFT JOIN tournament_results tr ON tr.tournament_id = p.tournament_id AND tr.golfer_id = p.golfer_id
    WHERE p.league_id = $1
  `;
  const params: unknown[] = [leagueId, CHALLENGE_SEASON, CHALLENGE_TOURNAMENTS_START_ON_OR_AFTER];

  if (tournamentId) {
    sql += ' AND p.tournament_id = $4';
    params.push(tournamentId);
  }

  sql += ' ORDER BY t.start_date ASC, p.pick_order ASC';

  return query<PickWithDetails>(sql, params);
}

export async function getLeagueStandings(leagueId: string): Promise<{ userId: string; username: string; totalPrizeMoney: number; pickCount: number }[]> {
  const members = await getLeagueMembers(leagueId);

  const results = await Promise.all(members.map(async member => {
    const result = await queryOne<{ total_prize_money: string; pick_count: string }>(
      `SELECT
        COALESCE(SUM(tr.prize_money), 0) as total_prize_money,
        COUNT(p.id) as pick_count
      FROM picks p
      JOIN tournaments t ON t.id = p.tournament_id
        AND t.season = $3
        AND (t.start_date::date) >= $4::date
      LEFT JOIN tournament_results tr ON tr.tournament_id = p.tournament_id AND tr.golfer_id = p.golfer_id
      WHERE p.league_id = $1 AND p.user_id = $2`,
      [leagueId, member.user_id, CHALLENGE_SEASON, CHALLENGE_TOURNAMENTS_START_ON_OR_AFTER],
    );

    return {
      userId: member.user_id,
      username: member.username,
      totalPrizeMoney: Number(result?.total_prize_money ?? 0),
      pickCount: Number(result?.pick_count ?? 0),
    };
  }));

  return results.sort((a, b) => b.totalPrizeMoney - a.totalPrizeMoney);
}

export async function updateTournamentResult(
  tournamentId: string,
  golferId: string,
  position: string,
  prizeMoney: number,
  score?: string,
  prizeSource: PrizeMoneySource = PRIZE_SOURCE_TIE_TABLE,
) {
  const id = uuidv4();
  await execute(
    `INSERT INTO tournament_results (id, tournament_id, golfer_id, position, prize_money, score, prize_source, prize_updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
     ON CONFLICT(tournament_id, golfer_id) DO UPDATE SET
       position = EXCLUDED.position,
       prize_money = EXCLUDED.prize_money,
       score = EXCLUDED.score,
       prize_source = EXCLUDED.prize_source,
       prize_updated_at = NOW()`,
    [id, tournamentId, golferId, position, prizeMoney, score || null, prizeSource],
  );
}

export async function updateTournamentStatus(tournamentId: string, status: string) {
  await execute('UPDATE tournaments SET status = $1 WHERE id = $2', [status, tournamentId]);
}

// Mark missed picks for all leagues for a given tournament
// Called by the pick-reminders cron after final deadline passes
export async function markMissedPicks(tournamentId: string): Promise<number> {
  const leagues = await query<{ id: string }>('SELECT DISTINCT id FROM leagues WHERE archived = FALSE');
  let missed = 0;

  for (const league of leagues) {
    const order = await getPickOrder(league.id, tournamentId);
    const now = new Date();

    for (const entry of order) {
      // Skip if they already picked
      const existingPick = await queryOne(
        'SELECT id FROM picks WHERE league_id = $1 AND user_id = $2 AND tournament_id = $3',
        [league.id, entry.userId, tournamentId]
      );
      if (existingPick) continue;

      // If their deadline has passed, mark as missed
      if (now > entry.deadline) {
        // Use a special "missed" golfer placeholder -- insert with a null-safe pattern
        // We insert a pick with is_missed=TRUE and a dummy golfer_id that won't match results
        // Actually, we just need to record the miss -- no golfer_id needed
        // Use the first available golfer as placeholder (won't earn anything without a result)
        await execute(
          `INSERT INTO picks (id, league_id, user_id, tournament_id, golfer_id, pick_order, is_missed)
           VALUES ($1, $2, $3, $4, (SELECT id FROM golfers ORDER BY world_ranking DESC LIMIT 1), $5, TRUE)
           ON CONFLICT (league_id, user_id, tournament_id) DO NOTHING`,
          [uuidv4(), league.id, entry.userId, tournamentId, entry.position]
        );
        await logAction('pick_missed', `Missed deadline for tournament`, league.id, entry.userId);
        missed++;
      }
    }
  }

  return missed;
}

// Get combined standings across all leagues for a user
export async function getCombinedLeaderboard(userId: string): Promise<{ leagueId: string; leagueName: string; totalPrizeMoney: number; rank: number }[]> {
  const leagues = await query<{ league_id: string; name: string }>(
    `SELECT lm.league_id, l.name FROM league_members lm
     JOIN leagues l ON lm.league_id = l.id
     WHERE lm.user_id = $1 AND l.archived = FALSE`,
    [userId]
  );

  const results = [];
  for (const league of leagues) {
    const standings = await getLeagueStandings(league.league_id);
    const myStanding = standings.find(s => s.userId === userId);
    const rank = standings.findIndex(s => s.userId === userId) + 1;
    results.push({
      leagueId: league.league_id,
      leagueName: league.name,
      totalPrizeMoney: myStanding?.totalPrizeMoney || 0,
      rank,
    });
  }

  return results;
}

// Reconcile payouts: for every pick in the current season, ensure a tournament_results
// row exists and that prize_money is populated from the payout table when missing.
// This covers cases where ESPN earnings were 0 or the golfer wasn't matched during sync.
export async function reconcilePickPayouts(): Promise<{ created: number; updated: number; historicalFetched: number }> {
  // Fix 4: before backfilling from the payout table, identify any completed
  // tournament that has picks with NO result row at all — those need the
  // historical ESPN fetch first (the table-calculated fallback would give
  // everyone $0 without a position). We dynamically import to avoid a module
  // load cycle with pga-data.ts.
  const tournamentsNeedingHistorical = await query<{ tournament_id: string; tournament_name: string }>(`
    SELECT DISTINCT t.id as tournament_id, t.name as tournament_name
    FROM picks p
    JOIN tournaments t ON t.id = p.tournament_id
    LEFT JOIN tournament_results tr ON tr.tournament_id = p.tournament_id AND tr.golfer_id = p.golfer_id
    WHERE t.season = $1
      AND (t.start_date::date) >= $2::date
      AND (t.end_date::date) < CURRENT_DATE
      AND p.is_missed = FALSE
      AND tr.id IS NULL
  `, [CHALLENGE_SEASON, CHALLENGE_TOURNAMENTS_START_ON_OR_AFTER]);

  let historicalFetched = 0;
  if (tournamentsNeedingHistorical.length > 0) {
    const { populateHistoricalTournament } = await import('./pga-data');
    for (const t of tournamentsNeedingHistorical) {
      try {
        const result = await populateHistoricalTournament(t.tournament_id, { force: true });
        historicalFetched += result.populated;
      } catch {
        // Non-fatal — the table-calculated fallback below will still run
      }
    }
  }

  // Find picks for completed tournaments that have no matching result or have $0 prize_money
  // despite having a numeric finish position.
  const orphanedPicks = await query<{
    pick_id: string;
    tournament_id: string;
    golfer_id: string;
    tournament_name: string;
    purse: number;
    result_id: string | null;
    position: string | null;
    prize_money: number | null;
  }>(`
    SELECT
      p.id as pick_id,
      p.tournament_id,
      p.golfer_id,
      t.name as tournament_name,
      t.purse,
      tr.id as result_id,
      tr.position,
      tr.prize_money::int as prize_money
    FROM picks p
    JOIN tournaments t ON t.id = p.tournament_id
    LEFT JOIN tournament_results tr ON tr.tournament_id = p.tournament_id AND tr.golfer_id = p.golfer_id
    WHERE t.season = $1
      AND (t.start_date::date) >= $2::date
      AND (t.end_date::date) < CURRENT_DATE
      AND p.is_missed = FALSE
      AND (tr.id IS NULL OR (tr.prize_money = 0 AND tr.position IS NOT NULL AND tr.position NOT IN ('MC','CUT','WD','DQ','DNS','MDF','')))
  `, [CHALLENGE_SEASON, CHALLENGE_TOURNAMENTS_START_ON_OR_AFTER]);

  let created = 0;
  let updated = 0;

  for (const row of orphanedPicks) {
    const pos = row.position ? parsePosition(row.position) : 0;
    const money = pos > 0 ? calculatePrizeMoney(row.purse, pos, row.tournament_name) : 0;

    if (!row.result_id) {
      if (pos <= 0) {
        continue;
      }
      await execute(
        `INSERT INTO tournament_results (id, tournament_id, golfer_id, position, prize_money, prize_source, prize_updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, NOW())
         ON CONFLICT(tournament_id, golfer_id) DO NOTHING`,
        [uuidv4(), row.tournament_id, row.golfer_id, row.position || '', money, PRIZE_SOURCE_TIE_TABLE],
      );
      created++;
    } else if (money > 0) {
      // Result exists with position but $0 — backfill the calculated payout
      await execute(
        `UPDATE tournament_results SET prize_money = $1, prize_source = $2, prize_updated_at = NOW() WHERE id = $3`,
        [money, PRIZE_SOURCE_TIE_TABLE, row.result_id],
      );
      updated++;
    }
  }

  const tournamentsToRecalc = new Set(orphanedPicks.map((r) => r.tournament_id));
  for (const tid of tournamentsToRecalc) {
    const t = await queryOne<{ name: string }>(`SELECT name FROM tournaments WHERE id = $1`, [tid]);
    if (!t) continue;
    await recalculateTournamentResultPayoutsFromPurse(tid);
    if (hasPublishedPayoutTable(t.name)) {
      await applyPublishedPayoutComplianceForTournament(tid, t.name);
    }
  }

  return { created, updated, historicalFetched };
}

/**
 * Rewrite prize_money for numeric finishers in one tournament from `tournaments.purse`
 * (ties split combined places). MC/CUT/WD rows are left unchanged.
 */
export async function recalculateTournamentResultPayoutsFromPurse(
  tournamentId: string,
): Promise<{ updated: number; hadResultRows: boolean }> {
  const t = await queryOne<{ name: string; purse: number }>(
    `SELECT name, purse FROM tournaments WHERE id = $1`,
    [tournamentId],
  );
  if (!t) return { updated: 0, hadResultRows: false };
  const rows = await query<{ id: string; position: string }>(
    `SELECT id, position FROM tournament_results WHERE tournament_id = $1`,
    [tournamentId],
  );
  if (rows.length === 0) return { updated: 0, hadResultRows: false };
  const alloc = allocatePurseByFinishPositions(t.purse, t.name, rows);
  let updated = 0;
  for (const [id, money] of alloc) {
    await execute(
      `UPDATE tournament_results SET prize_money = $1, prize_source = $2, prize_updated_at = NOW() WHERE id = $3`,
      [money, PRIZE_SOURCE_TIE_TABLE, id],
    );
    updated++;
  }
  return { updated, hadResultRows: true };
}

/**
 * Rewrite prize_money for every numeric finisher from current `tournaments.purse`
 * (ties split combined places). MC/CUT/WD rows are left unchanged.
 */
export async function recalculateAllTournamentResultPayoutsFromPurses(
  season = CHALLENGE_SEASON,
  tournamentStartOnOrAfter = CHALLENGE_TOURNAMENTS_START_ON_OR_AFTER,
): Promise<{ tournamentsWithResults: number; resultRowsUpdated: number }> {
  const tournaments = await query<{ id: string }>(
    `SELECT id FROM tournaments WHERE season = $1 AND (start_date::date) >= $2::date`,
    [season, tournamentStartOnOrAfter],
  );
  let tournamentsWithResults = 0;
  let resultRowsUpdated = 0;
  for (const t of tournaments) {
    const { updated, hadResultRows } = await recalculateTournamentResultPayoutsFromPurse(t.id);
    if (hadResultRows) tournamentsWithResults++;
    resultRowsUpdated += updated;
  }
  return { tournamentsWithResults, resultRowsUpdated };
}

/** Sync schedule purses into the DB, recompute finisher payouts from positions, then reconcile orphan picks. */
export async function syncPursesAndRecalculateParticipantTotals(
  season = CHALLENGE_SEASON,
): Promise<{
  pursesUpdated: number;
  tournamentsWithResults: number;
  resultRowsUpdated: number;
  reconciled: { created: number; updated: number; historicalFetched: number };
}> {
  const pursesUpdated = await syncTournamentPursesFromSchedule(season);
  const { tournamentsWithResults, resultRowsUpdated } =
    await recalculateAllTournamentResultPayoutsFromPurses(season);
  const reconciled = await reconcilePickPayouts();
  return { pursesUpdated, tournamentsWithResults, resultRowsUpdated, reconciled };
}

// Throttled reconciliation that runs at most once per 5 minutes per server instance.
// Call this from API endpoints that serve player-facing data so payouts stay current
// without waiting for cron jobs.
let lastReconcileTime = 0;
const RECONCILE_INTERVAL_MS = 5 * 60 * 1000;

export async function ensurePayoutsReconciled(): Promise<void> {
  const now = Date.now();
  if (now - lastReconcileTime < RECONCILE_INTERVAL_MS) return;
  lastReconcileTime = now;

  const orphanCount = await queryOne<{ count: string }>(`
    SELECT COUNT(*) as count
    FROM picks p
    JOIN tournaments t ON t.id = p.tournament_id
    LEFT JOIN tournament_results tr ON tr.tournament_id = p.tournament_id AND tr.golfer_id = p.golfer_id
    WHERE t.season = $1
      AND (t.start_date::date) >= $2::date
      AND (t.end_date::date) < CURRENT_DATE
      AND p.is_missed = FALSE
      AND (tr.id IS NULL OR (tr.prize_money = 0 AND tr.position IS NOT NULL AND tr.position NOT IN ('MC','CUT','WD','DQ','DNS','MDF','')))
  `, [CHALLENGE_SEASON, CHALLENGE_TOURNAMENTS_START_ON_OR_AFTER]);

  if (Number(orphanCount?.count) > 0) {
    await reconcilePickPayouts();
  }
}

/** Row where stored `tournament_results.prize_money` ≠ tie-table allocation from purse + positions. */
export type PayoutDriftAuditRow = {
  tournamentId: string;
  tournamentName: string;
  resultId: string;
  golferName: string;
  position: string;
  stored: number;
  expected: number;
};

/** Pick on a past event that still lacks result data or has $0 despite a numeric finish. */
export type PickValueAuditIssue = {
  issue: 'missing_result' | 'zero_prize_numeric_finish';
  leagueName: string;
  username: string;
  tournamentName: string;
  golferName: string;
};

export type PickValueAuditReport = {
  season: string;
  completedTournamentsWithResults: number;
  payoutDrifts: PayoutDriftAuditRow[];
  pickIssues: PickValueAuditIssue[];
  summary: {
    totalPastNonMissedPicks: number;
    picksMissingResultData: number;
    picksZeroPrizeNumericFinish: number;
    resultRowsOutOfSyncWithTieTable: number;
    ok: boolean;
  };
};

/**
 * Read-only audit for admin: compares every finisher row to `allocatePurseByFinishPositions`,
 * and flags picks on completed events that lack results or have $0 with a paying position.
 */
export async function auditAllPickValues(season = CHALLENGE_SEASON): Promise<PickValueAuditReport> {
  const payoutDrifts: PayoutDriftAuditRow[] = [];

  const completedTournaments = await query<{ id: string; name: string; purse: number }>(
    `SELECT t.id, t.name, t.purse
     FROM tournaments t
     WHERE t.season = $1 AND t.is_excluded = 0
       AND (t.start_date::date) >= $2::date
       AND (t.end_date::date) < CURRENT_DATE
       AND EXISTS (SELECT 1 FROM tournament_results tr WHERE tr.tournament_id = t.id)`,
    [season, CHALLENGE_TOURNAMENTS_START_ON_OR_AFTER],
  );

  for (const t of completedTournaments) {
    const rows = await query<{
      id: string;
      position: string;
      prize_money: number;
      golfer_name: string;
    }>(
      `SELECT tr.id, tr.position, tr.prize_money::int as prize_money, g.name as golfer_name
       FROM tournament_results tr
       JOIN golfers g ON g.id = tr.golfer_id
       WHERE tr.tournament_id = $1`,
      [t.id],
    );
    const alloc = allocatePurseByFinishPositions(
      t.purse,
      t.name,
      rows.map((r) => ({ id: r.id, position: r.position })),
    );
    for (const r of rows) {
      const expected = alloc.get(r.id);
      if (expected === undefined) continue;
      if (r.prize_money !== expected) {
        payoutDrifts.push({
          tournamentId: t.id,
          tournamentName: t.name,
          resultId: r.id,
          golferName: r.golfer_name,
          position: r.position,
          stored: r.prize_money,
          expected,
        });
      }
    }
  }

  const pickIssues: PickValueAuditIssue[] = [];
  let picksMissingResultData = 0;
  let picksZeroPrizeNumericFinish = 0;

  const picksAudit = await query<{
    league_name: string;
    username: string;
    tournament_name: string;
    golfer_name: string;
    position: string | null;
    prize_money: number | null;
    tr_id: string | null;
  }>(
    `SELECT l.name as league_name, u.username, t.name as tournament_name, g.name as golfer_name,
      tr.position, tr.prize_money::int as prize_money, tr.id as tr_id
     FROM picks p
     JOIN leagues l ON l.id = p.league_id
     JOIN users u ON u.id = p.user_id
     JOIN tournaments t ON t.id = p.tournament_id
     JOIN golfers g ON g.id = p.golfer_id
     LEFT JOIN tournament_results tr ON tr.tournament_id = p.tournament_id AND tr.golfer_id = p.golfer_id
     WHERE t.season = $1
       AND (t.start_date::date) >= $2::date
       AND (t.end_date::date) < CURRENT_DATE
       AND (p.is_missed IS NOT TRUE)`,
    [season, CHALLENGE_TOURNAMENTS_START_ON_OR_AFTER],
  );

  for (const row of picksAudit) {
    const hasPos = row.position != null && String(row.position).trim() !== '';
    if (!row.tr_id || !hasPos) {
      pickIssues.push({
        issue: 'missing_result',
        leagueName: row.league_name,
        username: row.username,
        tournamentName: row.tournament_name,
        golferName: row.golfer_name,
      });
      picksMissingResultData++;
      continue;
    }
    const pos = parsePosition(row.position!);
    if (pos > 0 && (row.prize_money === null || row.prize_money === 0)) {
      pickIssues.push({
        issue: 'zero_prize_numeric_finish',
        leagueName: row.league_name,
        username: row.username,
        tournamentName: row.tournament_name,
        golferName: row.golfer_name,
      });
      picksZeroPrizeNumericFinish++;
    }
  }

  return {
    season,
    completedTournamentsWithResults: completedTournaments.length,
    payoutDrifts,
    pickIssues,
    summary: {
      totalPastNonMissedPicks: picksAudit.length,
      picksMissingResultData,
      picksZeroPrizeNumericFinish,
      resultRowsOutOfSyncWithTieTable: payoutDrifts.length,
      ok:
        payoutDrifts.length === 0 &&
        picksMissingResultData === 0 &&
        picksZeroPrizeNumericFinish === 0,
    },
  };
}
