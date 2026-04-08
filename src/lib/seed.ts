import { getDbAsync } from './db';
import { seedTournaments, seedGolfers } from './pga-schedule';

let seeded = false;

export async function ensureSeeded() {
  if (seeded) return;
  await getDbAsync(); // Initialize DB first
  seedTournaments();
  seedGolfers();
  seeded = true;
}
