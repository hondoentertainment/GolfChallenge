import { initializeDb } from './db';
import { seedTournaments, seedGolfers } from './pga-schedule';
import { seedMastersResults } from './masters-results';
import { seedRBCHeritageResults } from './rbc-heritage-results';
import { seedCadillacChampionshipResults, seedTruistChampionshipResults } from './recent-tournament-results';
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
  await seedRBCHeritageResults();
  await seedCadillacChampionshipResults();
  await seedTruistChampionshipResults();

  // Historical ESPN backfill for completed events is handled by crons and admin jobs
  // (`populate-all`, `refresh-last-completed`, etc.). Running it here blocked every
  // cold-start request on `/api/auth/me`, `/api/public/recap`, and similar for 30s+.
}
