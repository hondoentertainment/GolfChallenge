import { initializeDb } from './db';
import { seedTournaments, seedGolfers } from './pga-schedule';

let seeded = false;

export async function ensureSeeded() {
  if (seeded) return;
  await initializeDb();
  await seedTournaments();
  await seedGolfers();
  seeded = true;
}
