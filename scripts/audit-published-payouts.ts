/**
 * Audit DB vs transcribed Sports Illustrated / Golf.com / GNN payout tables.
 * Optionally run `npm run sync-schedule-purses` first so `tournaments.purse` matches code.
 *
 *   node --env-file=.env.local ./node_modules/tsx/dist/cli.mjs scripts/audit-published-payouts.ts
 */
import { initializeDb } from '../src/lib/db';
import {
  auditPublishedPayoutCompliance,
  CHALLENGE_PUBLISHED_PAYOUT_SOURCES,
} from '../src/lib/published-payout-compliance';

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL is not set.');
    process.exit(1);
  }
  await initializeDb();
  const report = await auditPublishedPayoutCompliance();
  console.log('Sources:', JSON.stringify(CHALLENGE_PUBLISHED_PAYOUT_SOURCES, null, 2));
  console.log('Checked completed events with tables:', report.completedTournamentsChecked);
  console.log('Events finished but no published table yet:', report.tournamentsWithoutPublishedTable);
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) {
    console.error('\nNot 100% aligned with published tables (see mismatches / missingInDb).');
    console.error('Next: npm run sync-schedule-purses  (if you recently changed purses in code)');
    console.error('Then: npm run apply-published-media-sync-reconcile');
    console.error('Or run: npm run full-payout-repair (refresh ESPN + tie table + media + reconcile)');
    process.exit(1);
  }
  console.log('\nOK: all published rows in DB match within $1.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
