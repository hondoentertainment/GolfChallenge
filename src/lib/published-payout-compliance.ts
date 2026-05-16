import { query, queryOne, execute } from './db';
import { CHALLENGE_SEASON, CHALLENGE_TOURNAMENTS_START_ON_OR_AFTER } from './challenge-season';
import {
  CHALLENGE_PUBLISHED_PAYOUT_BY_TOURNAMENT,
  CHALLENGE_PUBLISHED_PAYOUT_SOURCES,
  normalizePublishedGolferName,
} from './challenge-published-payouts-2026';
import { PRIZE_SOURCE_PUBLISHED_MEDIA } from './prize-money-db';

export type PublishedPayoutMismatch = {
  tournamentName: string;
  golferName: string;
  dbPrize: number;
  publishedPrize: number;
  delta: number;
};

export type PublishedPayoutMissingRow = {
  tournament: string;
  golfer: string;
  published: number;
};

/**
 * Compare stored `tournament_results.prize_money` to published media tables for events
 * we have transcribed in `CHALLENGE_PUBLISHED_PAYOUT_BY_TOURNAMENT`.
 */
export async function auditPublishedPayoutCompliance(
  toleranceUsd = 1,
): Promise<{
  ok: boolean;
  mismatches: PublishedPayoutMismatch[];
  missingInDb: PublishedPayoutMissingRow[];
  tournamentsWithoutPublishedTable: string[];
  completedTournamentsChecked: string[];
}> {
  const mismatches: PublishedPayoutMismatch[] = [];
  const missingInDb: PublishedPayoutMissingRow[] = [];
  const tournamentsWithoutPublishedTable: string[] = [];
  const completedTournamentsChecked: string[] = [];

  const tournaments = await query<{ id: string; name: string }>(
    `SELECT id, name FROM tournaments
     WHERE season = $1
       AND (start_date::date) >= $2::date
       AND (end_date::date) < CURRENT_DATE
     ORDER BY start_date ASC`,
    [CHALLENGE_SEASON, CHALLENGE_TOURNAMENTS_START_ON_OR_AFTER],
  );

  for (const t of tournaments) {
    const published = CHALLENGE_PUBLISHED_PAYOUT_BY_TOURNAMENT[t.name];
    if (!published) {
      tournamentsWithoutPublishedTable.push(t.name);
      continue;
    }
    completedTournamentsChecked.push(t.name);

    const results = await query<{ golfer_name: string; prize_money: number; tr_id: string }>(
      `SELECT g.name as golfer_name, tr.prize_money::int as prize_money, tr.id as tr_id
       FROM tournament_results tr
       JOIN golfers g ON g.id = tr.golfer_id
       WHERE tr.tournament_id = $1`,
      [t.id],
    );
    const byGolfer = new Map(results.map((r) => [r.golfer_name, r]));

    for (const [pubLabel, pubAmt] of Object.entries(published)) {
      const dbName = normalizePublishedGolferName(pubLabel);
      const row = byGolfer.get(dbName);
      if (!row) {
        missingInDb.push({ tournament: t.name, golfer: dbName, published: pubAmt });
        continue;
      }
      if (Math.abs(row.prize_money - pubAmt) > toleranceUsd) {
        mismatches.push({
          tournamentName: t.name,
          golferName: dbName,
          dbPrize: row.prize_money,
          publishedPrize: pubAmt,
          delta: row.prize_money - pubAmt,
        });
      }
    }
  }

  return {
    ok: mismatches.length === 0 && missingInDb.length === 0,
    mismatches,
    missingInDb,
    tournamentsWithoutPublishedTable,
    completedTournamentsChecked,
  };
}

/** True when we have a transcribed media payout table for this tournament name. */
export function hasPublishedPayoutTable(tournamentName: string): boolean {
  return CHALLENGE_PUBLISHED_PAYOUT_BY_TOURNAMENT[tournamentName] != null;
}

/**
 * Set `prize_money` to published values for one event (only where a result row exists).
 */
export async function applyPublishedPayoutComplianceForTournament(
  tournamentId: string,
  tournamentName: string,
): Promise<{
  updated: number;
  skippedNoRow: { tournament: string; golfer: string; published: number }[];
}> {
  let updated = 0;
  const skippedNoRow: { tournament: string; golfer: string; published: number }[] = [];
  const published = CHALLENGE_PUBLISHED_PAYOUT_BY_TOURNAMENT[tournamentName];
  if (!published) return { updated: 0, skippedNoRow };

  for (const [pubLabel, pubAmt] of Object.entries(published)) {
    const dbName = normalizePublishedGolferName(pubLabel);
    const row = await queryOne<{ id: string }>(
      `SELECT tr.id FROM tournament_results tr
       JOIN golfers g ON g.id = tr.golfer_id
       WHERE tr.tournament_id = $1 AND g.name = $2`,
      [tournamentId, dbName],
    );
    if (!row) {
      skippedNoRow.push({ tournament: tournamentName, golfer: dbName, published: pubAmt });
      continue;
    }
    await execute(
      `UPDATE tournament_results SET prize_money = $1, prize_source = $2, prize_updated_at = NOW() WHERE id = $3`,
      [pubAmt, PRIZE_SOURCE_PUBLISHED_MEDIA, row.id],
    );
    updated++;
  }
  return { updated, skippedNoRow };
}

/**
 * Set `prize_money` to published values for every golfer listed for that event
 * in `CHALLENGE_PUBLISHED_PAYOUT_BY_TOURNAMENT` (only where a result row exists).
 */
export async function applyPublishedPayoutCompliance(): Promise<{
  updated: number;
  skippedNoRow: { tournament: string; golfer: string; published: number }[];
}> {
  let updated = 0;
  const skippedNoRow: { tournament: string; golfer: string; published: number }[] = [];

  const tournaments = await query<{ id: string; name: string }>(
    `SELECT id, name FROM tournaments
     WHERE season = $1 AND (start_date::date) >= $2::date
     ORDER BY start_date ASC`,
    [CHALLENGE_SEASON, CHALLENGE_TOURNAMENTS_START_ON_OR_AFTER],
  );

  for (const t of tournaments) {
    const r = await applyPublishedPayoutComplianceForTournament(t.id, t.name);
    updated += r.updated;
    skippedNoRow.push(...r.skippedNoRow);
  }

  return { updated, skippedNoRow };
}

export { CHALLENGE_PUBLISHED_PAYOUT_SOURCES };
