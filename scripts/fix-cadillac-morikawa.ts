/**
 * Cadillac 2026: insert missing Collin Morikawa result row + published payout.
 *
 * Usage: node --env-file=.env.local ./node_modules/tsx/dist/cli.mjs scripts/fix-cadillac-morikawa.ts
 */
import { v4 as uuidv4 } from 'uuid';
import { initializeDb, queryOne, execute, query } from '../src/lib/db';
import { CHALLENGE_SEASON } from '../src/lib/challenge-season';
import { PRIZE_SOURCE_PUBLISHED_MEDIA } from '../src/lib/prize-money-db';
import { CADILLAC_CHAMPIONSHIP_2026_PUBLISHED_USD } from '../src/lib/challenge-published-payouts-2026';
import { recalculateBadges } from '../src/lib/badges';

const TOURNAMENT = 'Cadillac Championship';
const GOLFER = 'Collin Morikawa';
const POSITION = 'T62';
const SCORE = '+1';
const PRIZE = CADILLAC_CHAMPIONSHIP_2026_PUBLISHED_USD[GOLFER]!;

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
  const g = await queryOne<{ id: string }>(
    `SELECT id FROM golfers WHERE name = $1 LIMIT 1`,
    [GOLFER],
  );
  if (!t || !g) {
    console.error('Missing tournament or golfer', { t, g });
    process.exit(1);
  }

  await execute(
    `INSERT INTO tournament_results (id, tournament_id, golfer_id, position, prize_money, score, prize_source, prize_updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
     ON CONFLICT (tournament_id, golfer_id) DO UPDATE SET
       position = EXCLUDED.position,
       prize_money = EXCLUDED.prize_money,
       score = EXCLUDED.score,
       prize_source = EXCLUDED.prize_source,
       prize_updated_at = NOW()`,
    [uuidv4(), t.id, g.id, POSITION, PRIZE, SCORE, PRIZE_SOURCE_PUBLISHED_MEDIA],
  );

  const row = await queryOne<{ position: string; prize_money: number }>(
    `SELECT tr.position, tr.prize_money::int AS prize_money
     FROM tournament_results tr
     WHERE tr.tournament_id = $1 AND tr.golfer_id = $2`,
    [t.id, g.id],
  );

  const leagues = await query<{ league_id: string }>(
    `SELECT DISTINCT p.league_id FROM picks p WHERE p.tournament_id = $1`,
    [t.id],
  );
  for (const l of leagues) {
    await recalculateBadges(l.league_id);
  }

  console.log({ golfer: GOLFER, tournament: TOURNAMENT, row, badgesRefreshed: leagues.length });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
