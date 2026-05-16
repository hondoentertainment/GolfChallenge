/**
 * Full payout repair: historical ESPN for all completed events, tie-table math,
 * reconcile picks, overlay transcribed media payouts, final reconcile + badges.
 *
 *   npm run full-payout-repair
 */
import { initializeDb } from '../src/lib/db';
import { runFullPayoutRepairPipeline } from '../src/lib/pga-data';

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL is not set. Use --env-file=.env.local or production env.');
    process.exit(1);
  }
  await initializeDb();
  const out = await runFullPayoutRepairPipeline();
  console.log(JSON.stringify(out, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
