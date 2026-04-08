import { seedTournaments, seedGolfers } from './pga-schedule';

let seeded = false;

export function ensureSeeded() {
  if (seeded) return;
  seedTournaments();
  seedGolfers();
  seeded = true;
}
