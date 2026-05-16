/**
 * Ops pipeline: sync schedule → apply media transcribed payouts → reconcile picks → badges.
 * Does NOT run `recalculateAllTournamentResultPayoutsFromPurses` (that would overwrite
 * published dollars with pure tie-table math).
 *
 *   npm run apply-published-media-sync-reconcile
 *
 * Prefer: `npm run audit-published-payouts` first; fix any `missingInDb` before this.
 */
import { initializeDb, query } from '../src/lib/db';
import { CHALLENGE_SEASON } from '../src/lib/challenge-season';
import { syncTournamentPursesFromSchedule } from '../src/lib/pga-schedule';
import { applyPublishedPayoutCompliance } from '../src/lib/published-payout-compliance';
import { reconcilePickPayouts } from '../src/lib/picks';
import { recalculateBadges } from '../src/lib/badges';

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL is not set.');
    process.exit(1);
  }
  await initializeDb();

  const pursesUpdated = await syncTournamentPursesFromSchedule(CHALLENGE_SEASON);
  const applied = await applyPublishedPayoutCompliance();
  const reconciled = await reconcilePickPayouts();

  const leagues = await query<{ league_id: string }>(
    `SELECT DISTINCT p.league_id FROM picks p
     JOIN tournaments t ON t.id = p.tournament_id
     WHERE t.season = $1`,
    [CHALLENGE_SEASON],
  );
  for (const l of leagues) {
    await recalculateBadges(l.league_id);
  }

  console.log(
    JSON.stringify(
      {
        pursesUpdated,
        publishedApply: applied,
        reconciled,
        badgesLeagues: leagues.length,
      },
      null,
      2,
    ),
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
