import { queryOne, execute } from './db';
import { v4 as uuidv4 } from 'uuid';

export type SeededResultRow = {
  name: string;
  position: string;
  score: string;
  prizeMoney: number;
};

export async function seedEventResultsIfEmpty(
  tournamentName: string,
  season: string,
  rows: SeededResultRow[]
): Promise<void> {
  const tourney = await queryOne<{ id: string }>(
    `SELECT id FROM tournaments WHERE name = $1 AND season = $2`,
    [tournamentName, season]
  );
  if (!tourney) return;

  const existingCount = await queryOne<{ count: string }>(
    `SELECT COUNT(*) as count FROM tournament_results WHERE tournament_id = $1`,
    [tourney.id]
  );
  if (Number(existingCount?.count) > 0) return;

  await execute(`UPDATE tournaments SET status = 'completed' WHERE id = $1`, [tourney.id]);

  for (const r of rows) {
    const golfer = await queryOne<{ id: string }>(`SELECT id FROM golfers WHERE name = $1`, [r.name]);
    if (!golfer) continue;

    await execute(
      `INSERT INTO tournament_results (id, tournament_id, golfer_id, position, prize_money, score)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT(tournament_id, golfer_id) DO NOTHING`,
      [uuidv4(), tourney.id, golfer.id, r.position, r.prizeMoney, r.score]
    );
  }
}
