// Live PGA Tour data integration
// Uses ESPN's public API for leaderboard data

import { query, queryOne } from './db';
import { updateTournamentResult, updateTournamentStatus, getGolfers, getTournament, getTournaments, reconcilePickPayouts } from './picks';
import { calculatePrizeMoney, parsePosition } from './pga-schedule';
import { recalculateBadges } from './badges';
import { notifyLeagueMembers } from './notifications';
import { logAction } from './audit';

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

// ESPN event IDs for the 2025-2026 tournaments (used to fetch historical data after
// the event has been replaced on the live scoreboard).
export const ESPN_EVENT_IDS: Record<string, string> = {
  'Masters Tournament': '401811941',
  'RBC Heritage': '401811942',
};

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

export async function syncTournamentResults(tournamentId: string): Promise<{ updated: number; errors: string[] }> {
  const data = await fetchPGALeaderboard();
  if (!data || !data.events?.length) {
    return { updated: 0, errors: ['Could not fetch PGA data'] };
  }

  const golfers = await getGolfers();
  const golferMap = new Map(golfers.map(g => [g.name.toLowerCase(), g.id]));

  const tournament = await getTournament(tournamentId);
  const purse = tournament?.purse ?? 0;
  const tournamentName = tournament?.name;

  let updated = 0;
  const errors: string[] = [];

  for (const event of data.events) {
    const competition = event.competitions?.[0];
    if (!competition) continue;

    // Update tournament status
    const state = event.status?.type?.state;
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
  }

  return { updated, errors };
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

// Fetch a completed tournament's final leaderboard from ESPN's historical summary
// endpoint and populate tournament_results for every competitor. Use this when
// the event has dropped off the live scoreboard (e.g. syncing the Masters after
// RBC Heritage has started). Returns the count of rows created/updated.
export async function populateHistoricalTournament(tournamentId: string): Promise<{
  populated: number;
  skipped: number;
  errors: string[];
}> {
  const tournament = await getTournament(tournamentId);
  if (!tournament) return { populated: 0, skipped: 0, errors: ['Tournament not found'] };

  const eventId = ESPN_EVENT_IDS[tournament.name];
  if (!eventId) return { populated: 0, skipped: 0, errors: [`No ESPN event ID mapped for ${tournament.name}`] };

  const summary = await fetchESPNEventSummary(eventId);
  if (!summary || summary.competitors.length === 0) {
    return { populated: 0, skipped: 0, errors: ['Could not fetch historical ESPN data'] };
  }

  const golfers = await getGolfers();
  const golferMap = new Map(golfers.map(g => [g.name.toLowerCase(), g.id]));

  let populated = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const competitor of summary.competitors) {
    const name = competitor.athlete?.displayName;
    if (!name) { skipped++; continue; }

    const golferId = golferMap.get(name.toLowerCase());
    if (!golferId) { skipped++; continue; }

    const position = competitor.status?.position?.displayName || '';
    const score = competitor.score?.displayValue || '';
    const espnEarnings = competitor.earnings || 0;
    // Only trust ESPN's earnings for MC/CUT/WD when the purse explicitly pays them
    // ($25k at the Masters). For finishing positions, use ESPN earnings directly —
    // they're the authoritative published figures.
    const prizeMoney = espnEarnings > 0
      ? espnEarnings
      : calculatePrizeMoney(tournament.purse, parsePosition(position), tournament.name);

    try {
      // Only insert if no existing result (don't overwrite audit-approved seeds)
      const existing = await queryOne<{ id: string; prize_money: number }>(
        `SELECT id, prize_money::int as prize_money FROM tournament_results
         WHERE tournament_id = $1 AND golfer_id = $2`,
        [tournamentId, golferId]
      );

      if (existing && existing.prize_money > 0) {
        // Keep the existing audit-approved value, don't overwrite
        continue;
      }

      await updateTournamentResult(tournamentId, golferId, position, prizeMoney, score);
      populated++;
    } catch (e) {
      errors.push(`${name}: ${e instanceof Error ? e.message : 'unknown'}`);
    }
  }

  return { populated, skipped, errors };
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
