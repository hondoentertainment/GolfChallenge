/**
 * Rewrite all completed-event prizes from DB purses + positions using the in-repo
 * PGA / Masters payout tables (same as Admin → Refresh all completed finishes).
 *
 *   npm run apply-official-payouts
 */
import { initializeDb } from '../src/lib/db';
import { refreshAllCompletedTournamentFinishes } from '../src/lib/pga-data';

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL is not set. Use --env-file=.env.local or production env.');
    process.exit(1);
  }
  await initializeDb();
  const result = await refreshAllCompletedTournamentFinishes();
  console.log(JSON.stringify(result, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
