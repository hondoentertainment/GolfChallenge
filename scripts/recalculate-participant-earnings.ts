/**
 * Sync purses from `pga-schedule`, recompute every finisher's `tournament_results.prize_money`
 * from current purses/positions, reconcile picks, then refresh badges — updates dollars shown in standings.
 *
 * Usage (from repo root):
 *   node --env-file=.env.local ./node_modules/tsx/dist/cli.mjs scripts/recalculate-participant-earnings.ts
 *
 * For production, use a connection string that points at the Neon database Vercel uses
 * (e.g. after `npx vercel env pull .env.production.local` and --env-file that file).
 */
import { initializeDb, query } from '../src/lib/db';
import { syncPursesAndRecalculateParticipantTotals } from '../src/lib/picks';
import { recalculateBadges } from '../src/lib/badges';

const SEASON = '2025-2026';

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL is not set. Use --env-file=.env.local (or production env file).');
    process.exit(1);
  }

  await initializeDb();
  const payout = await syncPursesAndRecalculateParticipantTotals(SEASON);
  console.log('syncPursesAndRecalculateParticipantTotals:', payout);

  const leagues = await query<{ league_id: string }>(
    `SELECT DISTINCT p.league_id FROM picks p
     JOIN tournaments t ON t.id = p.tournament_id
     WHERE t.season = $1`,
    [SEASON],
  );
  for (const l of leagues) {
    await recalculateBadges(l.league_id);
  }
  console.log(`Badges refreshed for ${leagues.length} league(s).`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
