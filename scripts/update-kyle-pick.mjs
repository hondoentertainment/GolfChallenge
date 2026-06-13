/**
 * Set user Kyle's pick for the active tournament to Matt Fitzpatrick (insert or update).
 * Usage: node --env-file=.env.local scripts/update-kyle-pick.mjs
 */
import { Pool } from '@neondatabase/serverless';
import { randomUUID } from 'crypto';

const SEASON = '2025-2026';
const TARGET_USERNAME = 'kyle';
const TARGET_GOLFER = 'Matt Fitzpatrick';

function computePickOrder(members, tournamentId, tournaments) {
  const tournamentIndex = tournaments.findIndex((t) => t.id === tournamentId);
  const memberCount = members.length;
  const rotation = tournamentIndex % memberCount;
  return members.map((_, i) => {
    const position = (i - rotation + memberCount) % memberCount;
    return { userId: members[i].user_id, position };
  });
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('DATABASE_URL is not set.');
    process.exit(1);
  }

  const pool = new Pool({ connectionString: url });
  const today = new Date().toISOString().split('T')[0];

  try {
    const user = (
      await pool.query(`SELECT id, username FROM users WHERE LOWER(username) = $1 LIMIT 1`, [TARGET_USERNAME])
    ).rows[0];
    if (!user) {
      console.error(`No user with username "${TARGET_USERNAME}" (case-insensitive) found.`);
      process.exit(1);
    }

    const tournament = (
      await pool.query(
        `SELECT id, name, start_date FROM tournaments
         WHERE season = $1 AND is_excluded = 0
           AND start_date <= $2::text AND end_date >= $2::text
         ORDER BY start_date ASC
         LIMIT 1`,
        [SEASON, today]
      )
    ).rows[0];

    if (!tournament) {
      console.error(`No active tournament for season ${SEASON} on ${today}.`);
      process.exit(1);
    }

    const golfer = (
      await pool.query(`SELECT id, name FROM golfers WHERE name = $1 LIMIT 1`, [TARGET_GOLFER])
    ).rows[0];
    if (!golfer) {
      console.error(`Golfer "${TARGET_GOLFER}" not found in database.`);
      process.exit(1);
    }

    const tournaments = (
      await pool.query(
        `SELECT id, start_date FROM tournaments WHERE season = $1 AND is_excluded = 0 ORDER BY start_date ASC`,
        [SEASON]
      )
    ).rows;

    const leagues = (
      await pool.query(
        `SELECT l.id, l.name FROM league_members lm
         JOIN leagues l ON l.id = lm.league_id
         WHERE lm.user_id = $1 AND (l.archived IS NULL OR l.archived = FALSE)`,
        [user.id]
      )
    ).rows;

    for (const league of leagues) {
      const existing = (
        await pool.query(
          `SELECT p.id, g.name AS golfer_name FROM picks p
           JOIN golfers g ON g.id = p.golfer_id
           WHERE p.league_id = $1 AND p.user_id = $2 AND p.tournament_id = $3`,
          [league.id, user.id, tournament.id]
        )
      ).rows[0];

      const fitzTakenByOther = (
        await pool.query(
          `SELECT u.username FROM picks p
           JOIN users u ON u.id = p.user_id
           WHERE p.league_id = $1 AND p.tournament_id = $2 AND p.golfer_id = $3 AND p.user_id <> $4
           LIMIT 1`,
          [league.id, tournament.id, golfer.id, user.id]
        )
      ).rows[0];

      const members = (
        await pool.query(
          `SELECT lm.user_id FROM league_members lm
           WHERE lm.league_id = $1 ORDER BY lm.joined_at ASC`,
          [league.id]
        )
      ).rows;

      const order = computePickOrder(members, tournament.id, tournaments);
      const myEntry = order.find((o) => o.userId === user.id);
      const pickPosition = myEntry?.position ?? 0;

      if (existing) {
        if (fitzTakenByOther) {
          console.error(
            `League "${league.name}": cannot use ${TARGET_GOLFER} — already picked by ${fitzTakenByOther.username}.`
          );
          continue;
        }
        if (existing.golfer_name === TARGET_GOLFER) {
          console.log(`League "${league.name}": already ${TARGET_GOLFER}. Skipped.`);
          continue;
        }
        await pool.query(`UPDATE picks SET golfer_id = $1 WHERE id = $2`, [golfer.id, existing.id]);
        console.log(`League "${league.name}": updated "${existing.golfer_name}" → ${TARGET_GOLFER}.`);
        continue;
      }

      if (fitzTakenByOther) {
        console.error(`League "${league.name}": ${TARGET_GOLFER} already picked by ${fitzTakenByOther.username}.`);
        continue;
      }

      const seasonReuse = (
        await pool.query(
          `SELECT t.name FROM picks p
           JOIN tournaments t ON t.id = p.tournament_id
           WHERE p.league_id = $1 AND p.user_id = $2 AND p.golfer_id = $3 AND t.season = $4`,
          [league.id, user.id, golfer.id, SEASON]
        )
      ).rows[0];
      if (seasonReuse) {
        console.error(
          `League "${league.name}": cannot pick ${TARGET_GOLFER} — already used in ${seasonReuse.name} this season.`
        );
        continue;
      }

      const id = randomUUID();
      await pool.query(
        `INSERT INTO picks (id, league_id, user_id, tournament_id, golfer_id, pick_order)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [id, league.id, user.id, tournament.id, golfer.id, pickPosition]
      );
      console.log(`League "${league.name}": inserted ${TARGET_GOLFER} (pick_order ${pickPosition}).`);
    }
  } finally {
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
