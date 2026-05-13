/**
 * Re-fetch ESPN historical for the N most recently finished events, overwrite result
 * dollars, apply PGA tie-table payouts, reconcile, refresh badges.
 *
 *   node --env-file=.env.local ./node_modules/tsx/dist/cli.mjs scripts/refresh-last-completed.ts [N]
 *
 * Default N=5. Max 20.
 */
import { initializeDb } from '../src/lib/db';
import { refreshLastCompletedTournaments } from '../src/lib/pga-data';

const raw = process.argv[2];
const n = raw ? Math.min(20, Math.max(1, parseInt(raw, 10) || 5)) : 5;

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL is not set. Use --env-file=.env.local or production env.');
    process.exit(1);
  }
  await initializeDb();
  const result = await refreshLastCompletedTournaments(n);
  console.log(JSON.stringify(result, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
