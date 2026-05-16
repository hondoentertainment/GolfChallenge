/**
 * Cadillac 2026: Cameron Young won; Scottie Scheffler 2nd (PGA TOUR). Fix DB + tie-table payouts.
 *
 * Usage: node --env-file=.env.local ./node_modules/tsx/dist/cli.mjs scripts/fix-cadillac-scottie-cameron.ts
 */
import { initializeDb, queryOne, execute } from '../src/lib/db';
import { recalculateTournamentResultPayoutsFromPurse } from '../src/lib/picks';
import { CHALLENGE_SEASON } from '../src/lib/challenge-season';
import { PRIZE_SOURCE_MANUAL } from '../src/lib/prize-money-db';
import { v4 as uuidv4 } from 'uuid';

const TOURNAMENT = 'Cadillac Championship';
const WINNER = 'Cameron Young';
const RUNNER_UP = 'Scottie Scheffler';

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL is not set.');
    process.exit(1);
  }
  await initializeDb();

  const t = await queryOne<{ id: string }>(
    `SELECT id FROM tournaments WHERE season = $1 AND name = $2 LIMIT 1`,
    [CHALLENGE_SEASON, TOURNAMENT],
  );
  if (!t) {
    console.error('Tournament not found:', TOURNAMENT);
    process.exit(1);
  }

  const winnerG = await queryOne<{ id: string }>(
    `SELECT id FROM golfers WHERE name = $1 LIMIT 1`,
    [WINNER],
  );
  const runnerG = await queryOne<{ id: string }>(
    `SELECT id FROM golfers WHERE name = $1 LIMIT 1`,
    [RUNNER_UP],
  );
  if (!winnerG || !runnerG) {
    console.error('Golfer not found in DB', { winnerG, runnerG });
    process.exit(1);
  }

  const winnerRow = await queryOne<{ id: string }>(
    `SELECT id FROM tournament_results WHERE tournament_id = $1 AND golfer_id = $2`,
    [t.id, winnerG.id],
  );

  if (!winnerRow) {
    const id = uuidv4();
    await execute(
      `INSERT INTO tournament_results (id, tournament_id, golfer_id, position, prize_money, score, prize_source, prize_updated_at)
       VALUES ($1, $2, $3, '1', 0, NULL, $4, NOW())`,
      [id, t.id, winnerG.id, PRIZE_SOURCE_MANUAL],
    );
    console.log('Inserted winner row:', WINNER);
  } else {
    await execute(`UPDATE tournament_results SET position = '1' WHERE id = $1`, [winnerRow.id]);
    console.log('Updated winner position:', WINNER);
  }

  const runnerRow = await queryOne<{ id: string }>(
    `SELECT id FROM tournament_results WHERE tournament_id = $1 AND golfer_id = $2`,
    [t.id, runnerG.id],
  );
  if (!runnerRow) {
    console.error('No tournament_results row for', RUNNER_UP);
    process.exit(1);
  }
  await execute(`UPDATE tournament_results SET position = '2' WHERE id = $1`, [runnerRow.id]);
  console.log('Set runner-up position 2:', RUNNER_UP);

  const roryG = await queryOne<{ id: string }>(
    `SELECT id FROM golfers WHERE name = 'Rory McIlroy' LIMIT 1`,
  );
  if (roryG) {
    const roryTr = await queryOne<{ id: string; position: string }>(
      `SELECT tr.id, tr.position FROM tournament_results tr
       WHERE tr.tournament_id = $1 AND tr.golfer_id = $2`,
      [t.id, roryG.id],
    );
    if (roryTr && (roryTr.position === '2' || roryTr.position === 'T2')) {
      await execute(
        `UPDATE tournament_results SET position = 'WD', prize_money = 0 WHERE id = $1`,
        [roryTr.id],
      );
      console.log(
        'Rory McIlroy: removed erroneous T2 (not on published Cadillac field results) → WD',
      );
    }
  }

  const { updated } = await recalculateTournamentResultPayoutsFromPurse(t.id);

  const w = await queryOne<{ position: string; prize_money: number }>(
    `SELECT tr.position, tr.prize_money::int AS prize_money FROM tournament_results tr
     JOIN golfers g ON g.id = tr.golfer_id WHERE tr.tournament_id = $1 AND g.name = $2`,
    [t.id, WINNER],
  );
  const s = await queryOne<{ position: string; prize_money: number }>(
    `SELECT tr.position, tr.prize_money::int AS prize_money FROM tournament_results tr
     JOIN golfers g ON g.id = tr.golfer_id WHERE tr.tournament_id = $1 AND g.name = $2`,
    [t.id, RUNNER_UP],
  );

  console.log({
    payoutRowsUpdated: updated,
    [WINNER]: w,
    [RUNNER_UP]: s,
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
