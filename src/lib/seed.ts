import { initializeDb } from './db';
import { seedTournaments, seedGolfers } from './pga-schedule';

let seeded = false;
let seeding: Promise<void> | null = null;

export async function ensureSeeded() {
  if (seeded) return;
  // Prevent concurrent seeding from parallel requests on cold start
  if (seeding) return seeding;
  seeding = doSeed();
  return seeding;
}

async function doSeed() {
  try {
    await initializeDb();
    await seedTournaments();
    await seedGolfers();
    seeded = true;
  } finally {
    seeding = null;
  }
}
