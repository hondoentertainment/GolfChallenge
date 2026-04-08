import { query, queryOne, execute } from './db';
import { v4 as uuidv4 } from 'uuid';
import { getLeagueStandings } from './picks';
import { awardBadge } from './badges';
import { logAction } from './audit';

export interface ArchivedSeason {
  id: string;
  league_id: string;
  season: string;
  winner_user_id: string | null;
  winner_username: string | null;
  winner_earnings: number;
  standings_json: string;
  archived_at: string;
}

export async function archiveSeason(leagueId: string, season: string, userId: string): Promise<ArchivedSeason> {
  // Check not already archived
  const existing = await queryOne(
    'SELECT id FROM archived_seasons WHERE league_id = $1 AND season = $2',
    [leagueId, season]
  );
  if (existing) throw new Error('Season already archived');

  const standings = await getLeagueStandings(leagueId);
  const winner = standings[0] || null;
  const id = uuidv4();

  await execute(
    `INSERT INTO archived_seasons (id, league_id, season, winner_user_id, winner_username, winner_earnings, standings_json)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [id, leagueId, season, winner?.userId || null, winner?.username || null, winner?.totalPrizeMoney || 0, JSON.stringify(standings)]
  );

  // Mark league as archived
  await execute('UPDATE leagues SET archived = TRUE WHERE id = $1', [leagueId]);

  // Award season winner badge
  if (winner) {
    await awardBadge(winner.userId, leagueId, 'season_winner');
  }

  await logAction('season_archived', `Season ${season} archived. Winner: ${winner?.username || 'none'}`, leagueId, userId);

  return {
    id, league_id: leagueId, season,
    winner_user_id: winner?.userId || null,
    winner_username: winner?.username || null,
    winner_earnings: winner?.totalPrizeMoney || 0,
    standings_json: JSON.stringify(standings),
    archived_at: new Date().toISOString(),
  };
}

export async function getArchivedSeasons(leagueId: string): Promise<ArchivedSeason[]> {
  return query<ArchivedSeason>(
    'SELECT * FROM archived_seasons WHERE league_id = $1 ORDER BY archived_at DESC',
    [leagueId]
  );
}

// Get prior season standings for draft order (worst to best)
export async function getPriorSeasonDraftOrder(leagueId: string): Promise<string[]> {
  const latest = await queryOne<ArchivedSeason>(
    'SELECT * FROM archived_seasons WHERE league_id = $1 ORDER BY archived_at DESC LIMIT 1',
    [leagueId]
  );
  if (!latest?.standings_json) return [];

  try {
    const standings = JSON.parse(latest.standings_json) as { userId: string }[];
    // Reverse: worst-performing player picks first
    return standings.map(s => s.userId).reverse();
  } catch {
    return [];
  }
}
