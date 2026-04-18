import { initializeDb, queryOne } from './db';
import { seedTournaments, seedGolfers } from './pga-schedule';
import { seedMastersResults } from './masters-results';
import { populateHistoricalTournament } from './pga-data';

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

    seeded = true;
  } finally {
    seeding = null;
  }
}
