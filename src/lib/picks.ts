import { query, queryOne, execute } from './db';
import { v4 as uuidv4 } from 'uuid';
import { getLeagueMembers } from './leagues';
import { getPickDeadline } from './pga-schedule';

export interface Pick {
  id: string;
  league_id: string;
  user_id: string;
  tournament_id: string;
  golfer_id: string;
  picked_at: string;
  pick_order: number;
}

export interface PickWithDetails extends Pick {
  username: string;
  golfer_name: string;
  tournament_name: string;
  prize_money: number;
}

export interface Tournament {
  id: string;
  name: string;
  start_date: string;
  end_date: string;
  course: string;
  location: string;
  purse: number;
  season: string;
  status: string;
  is_excluded: number;
}

export interface Golfer {
  id: string;
  name: string;
  world_ranking: number;
  country: string;
}

export async function getTournaments(season = '2025-2026'): Promise<Tournament[]> {
  return query<Tournament>(
    'SELECT * FROM tournaments WHERE season = $1 AND is_excluded = 0 ORDER BY start_date ASC',
    [season]
  );
}

export async function getTournament(id: string): Promise<Tournament | null> {
  return queryOne<Tournament>('SELECT * FROM tournaments WHERE id = $1', [id]);
}

export async function getGolfers(): Promise<Golfer[]> {
  return query<Golfer>('SELECT * FROM golfers ORDER BY world_ranking ASC');
}

export async function getCurrentTournament(season = '2025-2026'): Promise<Tournament | null> {
  const today = new Date().toISOString().split('T')[0];

  const active = await queryOne<Tournament>(
    'SELECT * FROM tournaments WHERE season = $1 AND is_excluded = 0 AND start_date <= $2 AND end_date >= $3 LIMIT 1',
    [season, today, today]
  );

  if (active) return active;

  const upcoming = await queryOne<Tournament>(
    'SELECT * FROM tournaments WHERE season = $1 AND is_excluded = 0 AND start_date > $2 ORDER BY start_date ASC LIMIT 1',
    [season, today]
  );

  return upcoming || null;
}

export async function getPickOrder(leagueId: string, tournamentId: string): Promise<{ userId: string; username: string; position: number; deadline: Date }[]> {
  const members = await getLeagueMembers(leagueId);
  const tournaments = await getTournaments();
  const tournamentIndex = tournaments.findIndex(t => t.id === tournamentId);
  const tournament = tournaments[tournamentIndex];

  if (!tournament || members.length === 0) return [];

  const memberCount = members.length;
  const rotation = tournamentIndex % memberCount;

  return members.map((member, i) => {
    const position = (i - rotation + memberCount) % memberCount;
    return {
      userId: member.user_id,
      username: member.username,
      position,
      deadline: getPickDeadline(position, tournament.start_date),
    };
  }).sort((a, b) => a.position - b.position);
}

export async function canUserPick(leagueId: string, userId: string, tournamentId: string): Promise<{ canPick: boolean; reason: string; deadline?: Date }> {
  const existingPick = await queryOne(
    'SELECT id FROM picks WHERE league_id = $1 AND user_id = $2 AND tournament_id = $3',
    [leagueId, userId, tournamentId]
  );

  if (existingPick) {
    return { canPick: false, reason: 'You have already made your pick for this tournament' };
  }

  const order = await getPickOrder(leagueId, tournamentId);
  const userOrder = order.find(o => o.userId === userId);

  if (!userOrder) {
    return { canPick: false, reason: 'You are not a member of this league' };
  }

  const now = new Date();

  for (const picker of order) {
    if (picker.position >= userOrder.position) break;

    const theirPick = await queryOne(
      'SELECT id FROM picks WHERE league_id = $1 AND user_id = $2 AND tournament_id = $3',
      [leagueId, picker.userId, tournamentId]
    );

    if (!theirPick && now < picker.deadline) {
      return {
        canPick: false,
        reason: `Waiting for ${picker.username} to pick (deadline: ${picker.deadline.toLocaleString('en-US', { timeZone: 'America/Los_Angeles' })})`,
        deadline: userOrder.deadline,
      };
    }
  }

  if (now > userOrder.deadline) {
    return { canPick: false, reason: 'Your pick deadline has passed', deadline: userOrder.deadline };
  }

  return { canPick: true, reason: 'Ready to pick', deadline: userOrder.deadline };
}

export async function makePick(leagueId: string, userId: string, tournamentId: string, golferId: string): Promise<Pick> {
  const golferTaken = await queryOne<{ id: string; username: string }>(
    'SELECT p.id, u.username FROM picks p JOIN users u ON p.user_id = u.id WHERE p.league_id = $1 AND p.tournament_id = $2 AND p.golfer_id = $3',
    [leagueId, tournamentId, golferId]
  );

  if (golferTaken) {
    throw new Error(`This golfer has already been picked by ${golferTaken.username}`);
  }

  const alreadyUsed = await queryOne<{ id: string; tournament_name: string }>(
    `SELECT p.id, t.name as tournament_name FROM picks p
     JOIN tournaments t ON p.tournament_id = t.id
     WHERE p.league_id = $1 AND p.user_id = $2 AND p.golfer_id = $3`,
    [leagueId, userId, golferId]
  );

  if (alreadyUsed) {
    throw new Error(`You already picked this golfer for ${alreadyUsed.tournament_name}. Each golfer can only be selected once per season.`);
  }

  const order = await getPickOrder(leagueId, tournamentId);
  const userOrder = order.find(o => o.userId === userId);
  const pickPosition = userOrder?.position ?? 0;

  const id = uuidv4();
  await execute(
    'INSERT INTO picks (id, league_id, user_id, tournament_id, golfer_id, pick_order) VALUES ($1, $2, $3, $4, $5, $6)',
    [id, leagueId, userId, tournamentId, golferId, pickPosition]
  );

  return {
    id,
    league_id: leagueId,
    user_id: userId,
    tournament_id: tournamentId,
    golfer_id: golferId,
    picked_at: new Date().toISOString(),
    pick_order: pickPosition,
  };
}

export async function getUserUsedGolfers(leagueId: string, userId: string): Promise<string[]> {
  const rows = await query<{ golfer_id: string }>(
    'SELECT golfer_id FROM picks WHERE league_id = $1 AND user_id = $2',
    [leagueId, userId]
  );
  return rows.map(r => r.golfer_id);
}

export async function getLeaguePicks(leagueId: string, tournamentId?: string): Promise<PickWithDetails[]> {
  let sql = `
    SELECT p.*, u.username, g.name as golfer_name, t.name as tournament_name,
      COALESCE(tr.prize_money, 0)::int as prize_money
    FROM picks p
    JOIN users u ON p.user_id = u.id
    JOIN golfers g ON p.golfer_id = g.id
    JOIN tournaments t ON p.tournament_id = t.id
    LEFT JOIN tournament_results tr ON tr.tournament_id = p.tournament_id AND tr.golfer_id = p.golfer_id
    WHERE p.league_id = $1
  `;
  const params: unknown[] = [leagueId];

  if (tournamentId) {
    sql += ' AND p.tournament_id = $2';
    params.push(tournamentId);
  }

  sql += ' ORDER BY t.start_date ASC, p.pick_order ASC';

  return query<PickWithDetails>(sql, params);
}

export async function getLeagueStandings(leagueId: string): Promise<{ userId: string; username: string; totalPrizeMoney: number; pickCount: number }[]> {
  const members = await getLeagueMembers(leagueId);

  const results = await Promise.all(members.map(async member => {
    const result = await queryOne<{ total_prize_money: string; pick_count: string }>(
      `SELECT
        COALESCE(SUM(tr.prize_money), 0) as total_prize_money,
        COUNT(p.id) as pick_count
      FROM picks p
      LEFT JOIN tournament_results tr ON tr.tournament_id = p.tournament_id AND tr.golfer_id = p.golfer_id
      WHERE p.league_id = $1 AND p.user_id = $2`,
      [leagueId, member.user_id]
    );

    return {
      userId: member.user_id,
      username: member.username,
      totalPrizeMoney: Number(result?.total_prize_money ?? 0),
      pickCount: Number(result?.pick_count ?? 0),
    };
  }));

  return results.sort((a, b) => b.totalPrizeMoney - a.totalPrizeMoney);
}

export async function updateTournamentResult(tournamentId: string, golferId: string, position: string, prizeMoney: number, score?: string) {
  const id = uuidv4();
  await execute(
    `INSERT INTO tournament_results (id, tournament_id, golfer_id, position, prize_money, score)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT(tournament_id, golfer_id) DO UPDATE SET
       position = EXCLUDED.position,
       prize_money = EXCLUDED.prize_money,
       score = EXCLUDED.score`,
    [id, tournamentId, golferId, position, prizeMoney, score || null]
  );
}

export async function updateTournamentStatus(tournamentId: string, status: string) {
  await execute('UPDATE tournaments SET status = $1 WHERE id = $2', [status, tournamentId]);
}
