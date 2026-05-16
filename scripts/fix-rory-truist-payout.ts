/**
 * Set Rory McIlroy's finish at Truist from official leaderboard and re-run PGA tie-table
 * payout for the whole event (correct tie splits).
 *
 * Usage: node --env-file=.env.local ./node_modules/tsx/dist/cli.mjs scripts/fix-rory-truist-payout.ts
 */
import { initializeDb, queryOne, execute } from '../src/lib/db';
import { recalculateTournamentResultPayoutsFromPurse } from '../src/lib/picks';
import { CHALLENGE_SEASON } from '../src/lib/challenge-season';

const TOURNAMENT = 'Truist Championship';
const GOLFER = 'Rory McIlroy';
/** Official 2026 Truist finish (PGA TOUR leaderboard): T19 at −5 (279). */
const POSITION = 'T19';

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL is not set.');
    process.exit(1);
  }
  await initializeDb();

  const row = await queryOne<{ tr_id: string; tournament_id: string }>(
    `SELECT tr.id AS tr_id, tr.tournament_id
     FROM tournament_results tr
     JOIN tournaments t ON t.id = tr.tournament_id
     JOIN golfers g ON g.id = tr.golfer_id
     WHERE t.season = $1 AND t.name = $2 AND g.name = $3`,
    [CHALLENGE_SEASON, TOURNAMENT, GOLFER],
  );

  if (!row) {
    console.error(`No tournament_results row for ${GOLFER} at ${TOURNAMENT}.`);
    process.exit(1);
  }

  await execute(`UPDATE tournament_results SET position = $1 WHERE id = $2`, [POSITION, row.tr_id]);

  const { updated } = await recalculateTournamentResultPayoutsFromPurse(row.tournament_id);

  const after = await queryOne<{ position: string; prize_money: number }>(
    `SELECT position, prize_money::int AS prize_money FROM tournament_results WHERE id = $1`,
    [row.tr_id],
  );

  console.log({
    golfer: GOLFER,
    tournament: TOURNAMENT,
    position: after?.position,
    prizeMoney: after?.prize_money,
    payoutRowsTouched: updated,
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
