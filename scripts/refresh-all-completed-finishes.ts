/**
 * Update finishes (positions/scores/prize from ESPN) for every player in every
 * completed tournament this season, then apply PGA tie-table payouts, reconcile, badges.
 *
 *   node --env-file=.env.local ./node_modules/tsx/dist/cli.mjs scripts/refresh-all-completed-finishes.ts
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
