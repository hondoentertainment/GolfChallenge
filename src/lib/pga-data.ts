// Live PGA Tour data integration
// Uses ESPN's public API for leaderboard data

import { query, queryOne } from './db';
import { updateTournamentResult, updateTournamentStatus, getGolfers, getTournament, getTournaments, reconcilePickPayouts } from './picks';
import { calculatePrizeMoney, parsePosition } from './pga-schedule';
import { recalculateBadges } from './badges';
import { notifyLeagueMembers } from './notifications';
import { logAction } from './audit';
import { auditPayouts } from './payout-audit';

interface ESPNCompetitor {
  athlete: { displayName: string };
  status: { position: { displayName: string } };
  linescores?: { value: number }[];
  score?: { displayValue: string };
  earnings?: number;
}

interface ESPNEvent {
  id: string;
  name: string;
  status: { type: { state: string } };
  competitions: {
    competitors: ESPNCompetitor[];
  }[];
}

interface ESPNResponse {
  events: ESPNEvent[];
}

const ESPN_PGA_URL = 'https://site.api.espn.com/apis/site/v2/sports/golf/pga/scoreboard';
const ESPN_EVENT_SUMMARY_URL = 'https://site.api.espn.com/apis/site/v2/sports/golf/pga/summary';
const ESPN_SCHEDULE_URL = 'https://site.api.espn.com/apis/site/v2/sports/golf/pga/scoreboard';

// Known ESPN event IDs for the 2025-2026 tournaments (used to fetch historical
// data after the event has been replaced on the live scoreboard). IDs for
// tournaments not listed here are discovered dynamically via discoverESPNEventId().
export const ESPN_EVENT_IDS: Record<string, string> = {
  'Masters Tournament': '401811941',
  'RBC Heritage': '401811942',
  'Truist Championship': '401811945',
};

// In-memory cache for dynamically discovered event IDs. Keyed by tournament name.
const discoveredEventIds = new Map<string, string>();

// Discover a tournament's ESPN event ID by scanning ESPN's scoreboard with a
// date filter. Falls back to null if not found. Cached after first discovery.
export async function discoverESPNEventId(tournamentName: string, startDate?: string): Promise<string | null> {
  if (ESPN_EVENT_IDS[tournamentName]) return ESPN_EVENT_IDS[tournamentName];
  if (discoveredEventIds.has(tournamentName)) return discoveredEventIds.get(tournamentName)!;

  try {
    // ESPN accepts ?dates=YYYYMMDD to filter the scoreboard by date
    const dateParam = startDate ? `?dates=${startDate.replace(/-/g, '')}` : '';
    const res = await fetch(`${ESPN_SCHEDULE_URL}${dateParam}`, { next: { revalidate: 3600 } });
    if (!res.ok) return null;
    const data = await res.json();

    const normalize = (s: string) => s.toLowerCase().replace(/the\s+/g, '').trim();
    const target = normalize(tournamentName);

    for (const event of data.events || []) {
      const name = normalize(event.name || event.shortName || '');
      if (name.includes(target.slice(0, 15)) || target.includes(name.slice(0, 15))) {
        const id = String(event.id);
        discoveredEventIds.set(tournamentName, id);
        return id;
      }
    }
  } catch {
    // Silent fail — caller handles null
  }
  return null;
}

export async function fetchPGALeaderboard(): Promise<ESPNResponse | null> {
  try {
    const res = await fetch(ESPN_PGA_URL, { next: { revalidate: 300 } }); // cache 5 min
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

// Fetch a specific historical event's final leaderboard from ESPN. Used to
// populate past tournaments after they've dropped off the live scoreboard.
export async function fetchESPNEventSummary(eventId: string): Promise<{ competitors: ESPNCompetitor[]; eventName: string } | null> {
  try {
    const res = await fetch(`${ESPN_EVENT_SUMMARY_URL}?event=${eventId}`, { next: { revalidate: 3600 } });
    if (!res.ok) return null;
    const data = await res.json();

    // ESPN's summary shape differs from the scoreboard. Competitor data is
    // usually nested under `leaderboard[0].players` or `competitions[0].competitors`
    // depending on the endpoint version. Handle both.
    const leaderboard = data.leaderboard?.[0] || data.header?.competitions?.[0];
    const competitors: ESPNCompetitor[] = (leaderboard?.players || leaderboard?.competitors || []).map((p: { athlete?: { displayName?: string }; fullName?: string; displayName?: string; status?: { position?: { displayName?: string } }; position?: { displayName?: string }; score?: { displayValue?: string } | string; earnings?: number; prizeMoney?: number }) => ({
      athlete: {
        displayName: p.athlete?.displayName || p.fullName || p.displayName || '',
      },
      status: {
        position: {
          displayName: p.status?.position?.displayName || p.position?.displayName || '',
        },
      },
      score: typeof p.score === 'object' && p.score !== null
        ? { displayValue: p.score.displayValue || '' }
        : { displayValue: typeof p.score === 'string' ? p.score : '' },
      earnings: p.earnings ?? p.prizeMoney ?? 0,
    }));

    return { competitors, eventName: data.header?.name || '' };
  } catch {
    return null;
  }
}

export async function syncTournamentResults(tournamentId: string): Promise<{ updated: number; errors: string[]; espnHadEvent: boolean }> {
  const data = await fetchPGALeaderboard();
  if (!data || !data.events?.length) {
    return { updated: 0, errors: ['Could not fetch PGA data'], espnHadEvent: false };
  }

  const golfers = await getGolfers();
  const golferMap = new Map(golfers.map(g => [g.name.toLowerCase(), g.id]));

  const tournament = await getTournament(tournamentId);
  const purse = tournament?.purse ?? 0;
  const tournamentName = tournament?.name;

  // Match the live scoreboard event to the tournament by name. If no match,
  // the ESPN scoreboard has moved on and we should fall back to historical.
  const normalize = (s: string) => s.toLowerCase().replace(/the\s+/g, '').trim();
  const targetName = normalize(tournamentName || '');
  const matchingEvent = targetName
    ? data.events.find(e => {
        const n = normalize(e.name || '');
        return n.includes(targetName.slice(0, 15)) || targetName.includes(n.slice(0, 15));
      })
    : data.events[0];

  if (!matchingEvent) {
    return { updated: 0, errors: [`ESPN scoreboard does not have ${tournamentName}`], espnHadEvent: false };
  }

  let updated = 0;
  const errors: string[] = [];

  const competition = matchingEvent.competitions?.[0];
  if (!competition) {
    return { updated: 0, errors: ['ESPN event has no competition data'], espnHadEvent: false };
  }

  const state = matchingEvent.status?.type?.state;
  if (state === 'post') {
    await updateTournamentStatus(tournamentId, 'completed');
  } else if (state === 'in') {
    await updateTournamentStatus(tournamentId, 'in_progress');
  }

  for (const competitor of competition.competitors) {
    const name = competitor.athlete?.displayName;
    if (!name) continue;

    const golferId = golferMap.get(name.toLowerCase());
    if (!golferId) continue;

    const position = competitor.status?.position?.displayName || '';
    const espnEarnings = competitor.earnings || 0;
    const prizeMoney = espnEarnings > 0
      ? espnEarnings
      : calculatePrizeMoney(purse, parsePosition(position), tournamentName);
    const score = competitor.score?.displayValue || '';

    try {
      await updateTournamentResult(tournamentId, golferId, position, prizeMoney, score);
      updated++;
    } catch (e) {
      errors.push(`Failed to update ${name}: ${e instanceof Error ? e.message : 'unknown'}`);
    }
  }

  return { updated, errors, espnHadEvent: true };
}

// Finalize payouts for a single tournament: sync ESPN one last time, reconcile
// all picks, mark the tournament completed, notify leagues, and recalculate badges.
// Falls back to ESPN historical fetch if the live scoreboard has moved on.
export async function finalizeTournamentPayouts(tournamentId: string): Promise<{
  synced: number;
  historicalPopulated: number;
  reconciled: { created: number; updated: number };
  notified: number;
}> {
  const syncResult = await syncTournamentResults(tournamentId);

  // Fix 1: if ESPN live scoreboard no longer has this event (or returned no
  // updates), fall back to the historical summary endpoint.
  let historicalPopulated = 0;
  if (!syncResult.espnHadEvent || syncResult.updated === 0) {
    const historical = await populateHistoricalTournament(tournamentId);
    historicalPopulated = historical.populated;
  }

  await updateTournamentStatus(tournamentId, 'completed');

  const reconciled = await reconcilePickPayouts();

  const tournament = await getTournament(tournamentId);
  const tournamentName = tournament?.name ?? 'Tournament';

  const leagues = await query<{ league_id: string }>(
    'SELECT DISTINCT league_id FROM picks WHERE tournament_id = $1',
    [tournamentId]
  );

  for (const l of leagues) {
    await notifyLeagueMembers(
      l.league_id, 'system', 'results',
      `${tournamentName} results finalized`,
      `Final payouts for ${tournamentName} have been captured. Check your standings!`
    );
    await recalculateBadges(l.league_id);
  }

  await logAction('finalize_payouts', `Finalized ${tournamentName}: ${syncResult.updated} synced, ${historicalPopulated} historical, ${reconciled.created + reconciled.updated} reconciled`);

  return {
    synced: syncResult.updated,
    historicalPopulated,
    reconciled,
    notified: leagues.length,
  };
}

// Find tournaments that ended recently but aren't marked completed, and finalize them.
// This catches any tournament whose cron sync was missed or ESPN data arrived late.
export async function finalizeRecentTournaments(): Promise<{
  finalized: { tournamentName: string; synced: number; reconciled: { created: number; updated: number } }[];
}> {
  const pending = await query<{ id: string; name: string }>(
    `SELECT id, name FROM tournaments
     WHERE season = '2025-2026'
       AND end_date < NOW()
       AND end_date > NOW() - INTERVAL '14 days'
       AND (status IS NULL OR status <> 'completed')
     ORDER BY end_date ASC`
  );

  const finalized = [];

  for (const t of pending) {
    const result = await finalizeTournamentPayouts(t.id);
    finalized.push({ tournamentName: t.name, synced: result.synced, reconciled: result.reconciled });
  }

  // Also reconcile picks for tournaments that ARE completed but may still
  // have orphaned picks (e.g. from a golfer name mismatch during sync)
  await reconcilePickPayouts();

  return { finalized };
}

// Populate every completed tournament in the season from ESPN historical data.
// This is the brute-force "ensure every golfer is listed for every event" sweep
// that runs at cold-start seed time and on-demand via admin. It's idempotent:
// populateHistoricalTournament never overwrites audit-approved rows.
export async function populateAllCompletedTournaments(): Promise<{
  tournaments: { name: string; populated: number; skipped: number; errors: number }[];
  totalPopulated: number;
}> {
  const completed = await query<{ id: string; name: string }>(
    `SELECT id, name FROM tournaments
     WHERE season = '2025-2026'
       AND end_date < NOW()
     ORDER BY end_date ASC`
  );

  const tournaments = [];
  let totalPopulated = 0;

  for (const t of completed) {
    try {
      const result = await populateHistoricalTournament(t.id);
      tournaments.push({
        name: t.name,
        populated: result.populated,
        skipped: result.skipped,
        errors: result.errors.length,
      });
      totalPopulated += result.populated;
    } catch (e) {
      tournaments.push({
        name: t.name,
        populated: 0,
        skipped: 0,
        errors: 1,
      });
      console.warn(`[populate-all] ${t.name} failed:`, e);
    }
  }

  return { tournaments, totalPopulated };
}

// Coverage report: for each tournament, count how many golfers have a result row.
// Used by admin to verify that every event has a fully populated leaderboard.
export async function getTournamentCoverage(): Promise<{
  tournaments: {
    id: string;
    name: string;
    status: string | null;
    endDate: string;
    resultRows: number;
    pickedWithResult: number;
    pickedWithoutResult: number;
  }[];
}> {
  const rows = await query<{
    id: string;
    name: string;
    status: string | null;
    end_date: string;
    result_rows: string;
    picked_with_result: string;
    picked_without_result: string;
  }>(`
    SELECT
      t.id,
      t.name,
      t.status,
      t.end_date,
      (SELECT COUNT(*) FROM tournament_results tr WHERE tr.tournament_id = t.id) as result_rows,
      (SELECT COUNT(DISTINCT p.golfer_id) FROM picks p
       JOIN tournament_results tr ON tr.tournament_id = p.tournament_id AND tr.golfer_id = p.golfer_id
       WHERE p.tournament_id = t.id) as picked_with_result,
      (SELECT COUNT(DISTINCT p.golfer_id) FROM picks p
       LEFT JOIN tournament_results tr ON tr.tournament_id = p.tournament_id AND tr.golfer_id = p.golfer_id
       WHERE p.tournament_id = t.id AND tr.id IS NULL AND p.is_missed = FALSE) as picked_without_result
    FROM tournaments t
    WHERE t.season = '2025-2026'
    ORDER BY t.start_date ASC
  `);

  return {
    tournaments: rows.map(r => ({
      id: r.id,
      name: r.name,
      status: r.status,
      endDate: r.end_date,
      resultRows: Number(r.result_rows),
      pickedWithResult: Number(r.picked_with_result),
      pickedWithoutResult: Number(r.picked_without_result),
    })),
  };
}

// Fetch a completed tournament's final leaderboard from ESPN's historical summary
// endpoint and populate tournament_results for every competitor. Use this when
// the event has dropped off the live scoreboard (e.g. syncing the Masters after
// RBC Heritage has started). Returns the count of rows created/updated.
export async function populateHistoricalTournament(tournamentId: string): Promise<{
  populated: number;
  skipped: number;
  errors: string[];
  auditWarnings: number;
}> {
  const tournament = await getTournament(tournamentId);
  if (!tournament) return { populated: 0, skipped: 0, errors: ['Tournament not found'], auditWarnings: 0 };

  // Fix 2: fall back to discovery when the ID isn't in the hardcoded map
  const eventId = ESPN_EVENT_IDS[tournament.name]
    ?? await discoverESPNEventId(tournament.name, tournament.start_date);
  if (!eventId) {
    return { populated: 0, skipped: 0, errors: [`No ESPN event ID for ${tournament.name} (tried discovery)`], auditWarnings: 0 };
  }

  const summary = await fetchESPNEventSummary(eventId);
  if (!summary || summary.competitors.length === 0) {
    return { populated: 0, skipped: 0, errors: ['Could not fetch historical ESPN data'], auditWarnings: 0 };
  }

  const golfers = await getGolfers();
  const golferMap = new Map(golfers.map(g => [g.name.toLowerCase(), g.id]));

  // Fix 3: audit-gate the ESPN data before writing. Build a PayoutEntry list
  // and run auditPayouts in lenient mode (critical invariants enforced; the
  // tie-math drift that arises from ESPN's published figures is only warned).
  const payoutEntries: { entry: import('./payout-audit').PayoutEntry; golferId: string }[] = [];
  let skipped = 0;

  for (const competitor of summary.competitors) {
    const name = competitor.athlete?.displayName;
    if (!name) { skipped++; continue; }
    const golferId = golferMap.get(name.toLowerCase());
    if (!golferId) { skipped++; continue; }

    const position = competitor.status?.position?.displayName || '';
    const score = competitor.score?.displayValue || '';
    const espnEarnings = competitor.earnings || 0;
    const prizeMoney = espnEarnings > 0
      ? espnEarnings
      : calculatePrizeMoney(tournament.purse, parsePosition(position), tournament.name);

    payoutEntries.push({
      entry: { name, position, score, prizeMoney },
      golferId,
    });
  }

  // Run audit on the ESPN batch — drops entries that fail critical checks
  const audit = auditPayouts(
    payoutEntries.map(p => p.entry),
    { tournamentName: tournament.name, purse: tournament.purse },
  );

  const auditedNames = new Set<string>();
  if (audit.approved) {
    for (const p of payoutEntries) auditedNames.add(p.entry.name);
  } else {
    // Partial approval: accept entries that don't appear in any error message
    const badNames = new Set<string>();
    for (const err of audit.errors) {
      for (const p of payoutEntries) {
        if (err.includes(p.entry.name)) badNames.add(p.entry.name);
      }
    }
    for (const p of payoutEntries) {
      if (!badNames.has(p.entry.name)) auditedNames.add(p.entry.name);
    }
    console.warn(`[populate-historical] ${tournament.name}: ${audit.errors.length} audit errors, accepting ${auditedNames.size}/${payoutEntries.length} entries`);
  }

  let populated = 0;
  const errors: string[] = [];

  for (const { entry, golferId } of payoutEntries) {
    if (!auditedNames.has(entry.name)) { skipped++; continue; }

    try {
      const existing = await queryOne<{ id: string; prize_money: number }>(
        `SELECT id, prize_money::int as prize_money FROM tournament_results
         WHERE tournament_id = $1 AND golfer_id = $2`,
        [tournamentId, golferId]
      );

      if (existing && existing.prize_money > 0) {
        // Keep the existing audit-approved value, don't overwrite
        continue;
      }

      await updateTournamentResult(tournamentId, golferId, entry.position, entry.prizeMoney, entry.score);
      populated++;
    } catch (e) {
      errors.push(`${entry.name}: ${e instanceof Error ? e.message : 'unknown'}`);
    }
  }

  return { populated, skipped, errors, auditWarnings: audit.warnings.length };
}

// Finalize payouts for a single tournament: sync ESPN one last time, reconcile
// all picks, mark the tournament completed, notify leagues, and recalculate badges.
export async function finalizeTournamentPayouts(tournamentId: string): Promise<{
  synced: number;
  reconciled: { created: number; updated: number };
  notified: number;
}> {
  const syncResult = await syncTournamentResults(tournamentId);

  await updateTournamentStatus(tournamentId, 'completed');

  const reconciled = await reconcilePickPayouts();

  const tournament = await getTournament(tournamentId);
  const tournamentName = tournament?.name ?? 'Tournament';

  const leagues = await query<{ league_id: string }>(
    'SELECT DISTINCT league_id FROM picks WHERE tournament_id = $1',
    [tournamentId]
  );

  for (const l of leagues) {
    await notifyLeagueMembers(
      l.league_id, 'system', 'results',
      `${tournamentName} results finalized`,
      `Final payouts for ${tournamentName} have been captured. Check your standings!`
    );
    await recalculateBadges(l.league_id);
  }

  await logAction('finalize_payouts', `Finalized ${tournamentName}: ${syncResult.updated} synced, ${reconciled.created + reconciled.updated} reconciled`);

  return { synced: syncResult.updated, reconciled, notified: leagues.length };
}

// Find tournaments that ended recently but aren't marked completed, and finalize them.
// This catches any tournament whose cron sync was missed or ESPN data arrived late.
export async function finalizeRecentTournaments(): Promise<{
  finalized: { tournamentName: string; synced: number; reconciled: { created: number; updated: number } }[];
}> {
  const pending = await query<{ id: string; name: string }>(
    `SELECT id, name FROM tournaments
     WHERE season = '2025-2026'
       AND end_date < NOW()
       AND end_date > NOW() - INTERVAL '14 days'
       AND (status IS NULL OR status <> 'completed')
     ORDER BY end_date ASC`
  );

  const finalized = [];

  for (const t of pending) {
    const result = await finalizeTournamentPayouts(t.id);
    finalized.push({ tournamentName: t.name, synced: result.synced, reconciled: result.reconciled });
  }

  // Also reconcile picks for tournaments that ARE completed but may still
  // have orphaned picks (e.g. from a golfer name mismatch during sync)
  await reconcilePickPayouts();

  return { finalized };
}

// Get the tournament ID that matches the current ESPN event
export async function matchCurrentTournament(eventName: string): Promise<string | null> {
  // Fuzzy match tournament name
  const normalized = eventName.toLowerCase().replace(/the\s+/g, '');
  const row = await queryOne<{ id: string }>(
    `SELECT id FROM tournaments
     WHERE LOWER(REPLACE(name, 'the ', '')) LIKE $1
     AND season = '2025-2026'
     LIMIT 1`,
    [`%${normalized.slice(0, 20)}%`]
  );
  return row?.id || null;
}
