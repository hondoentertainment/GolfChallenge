/**
 * Push `PGA_SCHEDULE_2025_2026` purse (and dates/course/location) into `tournaments`.
 * Use after editing `pga-schedule.ts` (e.g. PGA Championship $20.5M) so the DB matches code.
 *
 *   node --env-file=.env.local ./node_modules/tsx/dist/cli.mjs scripts/sync-schedule-purses.ts
 */
import { initializeDb } from '../src/lib/db';
import { CHALLENGE_SEASON } from '../src/lib/challenge-season';
import { syncTournamentPursesFromSchedule } from '../src/lib/pga-schedule';

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL is not set. Use --env-file=.env.local or production env.');
    process.exit(1);
  }
  await initializeDb();
  const updated = await syncTournamentPursesFromSchedule(CHALLENGE_SEASON);
  console.log(
    JSON.stringify(
      { season: CHALLENGE_SEASON, tournamentRowsUpdated: updated },
      null,
      2,
    ),
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
