import { queryOne, execute } from './db';
import { v4 as uuidv4 } from 'uuid';

export type SeededResultRow = {
  name: string;
  position: string;
  score: string;
  prizeMoney: number;
};

async function seedResultsForTournamentIfEmpty(tournamentId: string, rows: SeededResultRow[]): Promise<void> {
  const existingCount = await queryOne<{ count: string }>(
    `SELECT COUNT(*) as count FROM tournament_results WHERE tournament_id = $1`,
    [tournamentId]
  );
  if (Number(existingCount?.count) > 0) return;

  await execute(`UPDATE tournaments SET status = 'completed' WHERE id = $1`, [tournamentId]);

  for (const r of rows) {
    const golfer = await queryOne<{ id: string }>(`SELECT id FROM golfers WHERE name = $1`, [r.name]);
    if (!golfer) continue;

    await execute(
      `INSERT INTO tournament_results (id, tournament_id, golfer_id, position, prize_money, score)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT(tournament_id, golfer_id) DO NOTHING`,
      [uuidv4(), tournamentId, golfer.id, r.position, r.prizeMoney, r.score]
    );
  }
}

/** Seeds when the tournament row exists and has zero results (any calendar date). */
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
  await seedResultsForTournamentIfEmpty(tourney.id, rows);
}

/**
 * Seeds only after `end_date` is before today (UTC date). Use for illustrative
 * full-field results so future events are not marked completed early.
 */
export async function seedEventResultsIfPastEndAndEmpty(
  tournamentName: string,
  season: string,
  rows: SeededResultRow[]
): Promise<void> {
  const tourney = await queryOne<{ id: string; end_date: string }>(
    `SELECT id, end_date FROM tournaments WHERE name = $1 AND season = $2`,
    [tournamentName, season]
  );
  if (!tourney) return;
  const today = new Date().toISOString().split('T')[0];
  if (tourney.end_date >= today) return;
  await seedResultsForTournamentIfEmpty(tourney.id, rows);
}
