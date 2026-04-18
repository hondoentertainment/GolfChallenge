import { initializeDb } from './db';
import { seedTournaments, seedGolfers } from './pga-schedule';
import { seedMastersResults } from './masters-results';
import { populateAllCompletedTournaments } from './pga-data';

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

  // After the audit-approved Masters seed, populate every completed tournament
  // from ESPN's historical summary. audit-approved rows are never overwritten;
  // ESPN only fills gaps. This is the "ensure every golfer is listed for every
  // event" sweep that runs on every cold start.
  try {
    const result = await populateAllCompletedTournaments();
    const nonEmpty = result.tournaments.filter(t => t.populated > 0);
    if (nonEmpty.length > 0) {
      for (const t of nonEmpty) {
        console.log(`[seed] ${t.name}: +${t.populated} players from ESPN historical`);
      }
    }
  } catch (e) {
    console.warn('[seed] Could not run historical population sweep:', e);
  }
}
