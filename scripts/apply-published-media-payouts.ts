/**
 * Apply published (media) dollar amounts to tournament_results for transcribed events.
 * Run `audit-published-payouts` first. Does not insert missing rows.
 *
 * After this, run `npm run apply-published-media-sync-reconcile` to sync purses, reconcile
 * picks, and refresh badges. Do not run `recalc-earnings` next —
 * it rebuilds prizes from the tie table and undoes media alignment.
 *
 *   node --env-file=.env.local ./node_modules/tsx/dist/cli.mjs scripts/apply-published-media-payouts.ts
 */
import { initializeDb } from '../src/lib/db';
import { applyPublishedPayoutCompliance } from '../src/lib/published-payout-compliance';

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL is not set.');
    process.exit(1);
  }
  await initializeDb();
  const result = await applyPublishedPayoutCompliance();
  console.log(JSON.stringify(result, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
