/**
 * Read-only: compare stored `tournament_results.prize_money` to PGA tie-table payouts
 * and flag picks on completed events missing results or $0 with a paying position.
 *
 *   node --env-file=.env.local ./node_modules/tsx/dist/cli.mjs scripts/audit-pick-payouts.ts
 */
import { initializeDb } from '../src/lib/db';
import { auditAllPickValues } from '../src/lib/picks';

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL is not set. Use --env-file=.env.local or production env.');
    process.exit(1);
  }

  await initializeDb();
  const report = await auditAllPickValues();

  console.log(JSON.stringify({ season: report.season, summary: report.summary }, null, 2));
  console.log(`Completed tournaments with result rows: ${report.completedTournamentsWithResults}`);

  if (report.summary.ok) {
    console.log('\nOK: participant payouts align with tie-table math; picks on past events have result data.');
    return;
  }

  const driftSample = 15;
  const pickSample = 20;
  if (report.payoutDrifts.length) {
    console.log(`\nPayout drifts (stored vs tie-table), first ${driftSample} of ${report.payoutDrifts.length}:`);
    console.log(JSON.stringify(report.payoutDrifts.slice(0, driftSample), null, 2));
  }
  if (report.pickIssues.length) {
    console.log(`\nPick issues, first ${pickSample} of ${report.pickIssues.length}:`);
    console.log(JSON.stringify(report.pickIssues.slice(0, pickSample), null, 2));
  }

  console.error('\nAudit failed: run `npm run full-payout-repair` (recommended), or `npm run update-all-values` then `npm run apply-published-media-sync-reconcile`, then re-run this script.');
  process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
