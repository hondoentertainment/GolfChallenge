// Live PGA Tour data integration
// Uses ESPN's public API for leaderboard data

import { queryOne } from './db';
import { updateTournamentResult, updateTournamentStatus, getGolfers, getTournament } from './picks';
import { calculatePrizeMoney, parsePosition } from './pga-schedule';

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

export async function fetchPGALeaderboard(): Promise<ESPNResponse | null> {
  try {
    const res = await fetch(ESPN_PGA_URL, { next: { revalidate: 300 } }); // cache 5 min
    if (!res.ok) return null;
    return await res.json();
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
