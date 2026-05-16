/**
 * Set Matt Fitzpatrick's Truist Championship prize_money (manual correction).
 * Usage: node --env-file=.env.local scripts/set-truist-fitzpatrick-payout.mjs
 */
import { Pool } from '@neondatabase/serverless';

const SEASON = '2025-2026';
const TOURNAMENT = 'Truist Championship';
const GOLFER = 'Matt Fitzpatrick';
const PRIZE_MONEY = 46_950;

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('DATABASE_URL is not set.');
    process.exit(1);
  }

  const pool = new Pool({ connectionString: url });

  try {
    const { rowCount, rows } = await pool.query(
      `UPDATE tournament_results tr
       SET prize_money = $1
       FROM tournaments t, golfers g
       WHERE tr.tournament_id = t.id
         AND tr.golfer_id = g.id
         AND t.season = $2
         AND t.name = $3
         AND g.name = $4
       RETURNING tr.id, t.name AS tournament, g.name AS golfer, tr.position, tr.prize_money`,
      [PRIZE_MONEY, SEASON, TOURNAMENT, GOLFER],
    );

    if (!rowCount) {
      console.error(`No tournament_results row for ${GOLFER} at ${TOURNAMENT} (${SEASON}).`);
      process.exit(1);
    }

    console.log('Updated:', rows[0]);
  } finally {
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
