import { initializeDb, queryOne } from './db';
import { seedTournaments, seedGolfers } from './pga-schedule';
import { seedMastersResults } from './masters-results';
import { populateHistoricalTournament } from './pga-data';

// Fix 6: use a single in-flight promise as the concurrency guard. The first
// caller initializes it and all subsequent callers (even those racing on a
// cold-start boot) await the same promise. Only the initializer can reset
// the `seeded` flag, which eliminates the double-seed race the audit flagged.
let seedPromise: Promise<void> | null = null;
let seeded = false;

export async function ensureSeeded() {
  if (seeded) return;
  if (seedPromise) return seedPromise;
  seedPromise = doSeed().then(
    () => {
      seeded = true;
    },
    (err) => {
      // Reset so a future caller can retry after a transient failure.
      seedPromise = null;
      throw err;
    },
  );
  return seedPromise;
}

async function doSeed() {
  await initializeDb();
  await seedTournaments();
  await seedGolfers();
  await seedMastersResults();

  // After the audit-approved Masters seed, fill in every remaining player from
  // ESPN's historical summary. The audit seed is the source of truth for
  // verified entries; ESPN fills in the rest (MCs, mid-pack finishers, etc.).
  try {
    const masters = await queryOne<{ id: string }>(
      `SELECT id FROM tournaments WHERE name = 'Masters Tournament' AND season = '2025-2026'`
    );
    if (masters) {
      const result = await populateHistoricalTournament(masters.id);
      if (result.populated > 0) {
        console.log(`[seed] Populated ${result.populated} additional Masters players from ESPN historical data`);
      }
    }
  } catch (e) {
    console.warn('[seed] Could not populate remaining Masters players from ESPN:', e);
  }
}
