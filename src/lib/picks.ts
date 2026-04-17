import { query, queryOne, execute } from './db';
import { v4 as uuidv4 } from 'uuid';
import { getLeagueMembers } from './leagues';
import { getPickDeadline, calculatePrizeMoney, parsePosition } from './pga-schedule';
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

export async function getTournaments(season = '2025-2026'): Promise<Tournament[]> {
  return query<Tournament>(
    'SELECT * FROM tournaments WHERE season = $1 AND is_excluded = 0 ORDER BY start_date ASC',
    [season]
  );
}

export async function getTournament(id: string): Promise<Tournament | null> {
  return queryOne<Tournament>('SELECT * FROM tournaments WHERE id = $1', [id]);
}

export async function getGolfers(): Promise<Golfer[]> {
  return query<Golfer>('SELECT * FROM golfers ORDER BY world_ranking ASC');
}

export async function getCurrentTournament(season = '2025-2026'): Promise<Tournament | null> {
  const today = new Date().toISOString().split('T')[0];

  const active = await queryOne<Tournament>(
    'SELECT * FROM tournaments WHERE season = $1 AND is_excluded = 0 AND start_date <= $2 AND end_date >= $3 LIMIT 1',
    [season, today, today]
  );

  if (active) return active;

  const upcoming = await queryOne<Tournament>(
    'SELECT * FROM tournaments WHERE season = $1 AND is_excluded = 0 AND start_date > $2 ORDER BY start_date ASC LIMIT 1',
    [season, today]
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
    LEFT JOIN tournament_results tr ON tr.tournament_id = p.tournament_id AND tr.golfer_id = p.golfer_id
    WHERE p.league_id = $1
  `;
  const params: unknown[] = [leagueId];

  if (tournamentId) {
    sql += ' AND p.tournament_id = $2';
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
      LEFT JOIN tournament_results tr ON tr.tournament_id = p.tournament_id AND tr.golfer_id = p.golfer_id
      WHERE p.league_id = $1 AND p.user_id = $2`,
      [leagueId, member.user_id]
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

export async function updateTournamentResult(tournamentId: string, golferId: string, position: string, prizeMoney: number, score?: string) {
  const id = uuidv4();
  await execute(
    `INSERT INTO tournament_results (id, tournament_id, golfer_id, position, prize_money, score)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT(tournament_id, golfer_id) DO UPDATE SET
       position = EXCLUDED.position,
       prize_money = EXCLUDED.prize_money,
       score = EXCLUDED.score`,
    [id, tournamentId, golferId, position, prizeMoney, score || null]
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
export async function reconcilePickPayouts(): Promise<{ created: number; updated: number }> {
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
      AND t.end_date < NOW()
      AND p.is_missed = FALSE
      AND (tr.id IS NULL OR (tr.prize_money = 0 AND tr.position IS NOT NULL AND tr.position NOT IN ('MC','CUT','WD','DQ','DNS','MDF','')))
  `, ['2025-2026']);

  let created = 0;
  let updated = 0;

  for (const row of orphanedPicks) {
    const pos = row.position ? parsePosition(row.position) : 0;
    const money = pos > 0 ? calculatePrizeMoney(row.purse, pos, row.tournament_name) : 0;

    if (!row.result_id) {
      // No result row at all — create one
      await execute(
        `INSERT INTO tournament_results (id, tournament_id, golfer_id, position, prize_money)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT(tournament_id, golfer_id) DO NOTHING`,
        [uuidv4(), row.tournament_id, row.golfer_id, row.position || '', money]
      );
      created++;
    } else if (money > 0) {
      // Result exists with position but $0 — backfill the calculated payout
      await execute(
        `UPDATE tournament_results SET prize_money = $1 WHERE id = $2`,
        [money, row.result_id]
      );
      updated++;
    }
  }

  return { created, updated };
}
