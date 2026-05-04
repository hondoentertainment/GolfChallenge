import { initializeDb } from './db';
import { seedTournaments, seedGolfers } from './pga-schedule';
import { seedMastersResults } from './masters-results';
import { seedRecentTournamentResults } from './recent-tournament-results';

let seeded = false;
let seeding: Promise<void> | null = null;

export async function ensureSeeded() {
  if (seeded) return;
  if (seeding) return seeding;
  seeding = doSeed();
  return seeding;
}

async function doSeed() {
  try {
    await initializeDb();
    await seedTournaments();
    await seedGolfers();
    await seedMastersResults();
    await seedRecentTournamentResults();
    seeded = true;
  } finally {
    seeding = null;
  }
}
