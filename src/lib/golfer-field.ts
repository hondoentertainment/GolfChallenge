// Fetch the tournament field (golfers actually playing this week) from ESPN
// Falls back to full golfer list if API unavailable

interface ESPNFieldCompetitor {
  athlete: { displayName: string };
}

interface ESPNFieldResponse {
  events: {
    competitions: {
      competitors: ESPNFieldCompetitor[];
    }[];
  }[];
}

const ESPN_PGA_URL = 'https://site.api.espn.com/apis/site/v2/sports/golf/pga/scoreboard';

export async function fetchTournamentField(): Promise<string[]> {
  try {
    const res = await fetch(ESPN_PGA_URL, { next: { revalidate: 3600 } }); // cache 1 hour
    if (!res.ok) return [];
    const data: ESPNFieldResponse = await res.json();

    const names: string[] = [];
    for (const event of data.events || []) {
      for (const comp of event.competitions || []) {
        for (const c of comp.competitors || []) {
          if (c.athlete?.displayName) {
            names.push(c.athlete.displayName.toLowerCase());
          }
        }
      }
    }
    return names;
  } catch {
    return [];
  }
}

// Match field names against our golfer database
import { query } from './db';

export async function getFieldGolferIds(): Promise<string[]> {
  const fieldNames = await fetchTournamentField();
  if (fieldNames.length === 0) return []; // empty = show all (fallback)

  const golfers = await query<{ id: string; name: string }>('SELECT id, name FROM golfers');
  const matchedIds: string[] = [];

  for (const g of golfers) {
    if (fieldNames.includes(g.name.toLowerCase())) {
      matchedIds.push(g.id);
    }
  }

  return matchedIds;
}
