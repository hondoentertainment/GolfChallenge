import getDb from './db';
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

export function getTournaments(season = '2025-2026'): Tournament[] {
  const db = getDb();
  return db.prepare(
    'SELECT * FROM tournaments WHERE season = ? AND is_excluded = 0 ORDER BY start_date ASC'
  ).all(season) as Tournament[];
}

export function getTournament(id: string): Tournament | null {
  const db = getDb();
  return db.prepare('SELECT * FROM tournaments WHERE id = ?').get(id) as Tournament | null;
}

export function getGolfers(): Golfer[] {
  const db = getDb();
  return db.prepare('SELECT * FROM golfers ORDER BY world_ranking ASC').all() as Golfer[];
}

export function getCurrentTournament(season = '2025-2026'): Tournament | null {
  const db = getDb();
  const today = new Date().toISOString().split('T')[0];

  // First check if there's an active tournament
  const active = db.prepare(
    'SELECT * FROM tournaments WHERE season = ? AND is_excluded = 0 AND start_date <= ? AND end_date >= ? LIMIT 1'
  ).get(season, today, today) as Tournament | undefined;

  if (active) return active;

  // Otherwise get the next upcoming tournament
  const upcoming = db.prepare(
    'SELECT * FROM tournaments WHERE season = ? AND is_excluded = 0 AND start_date > ? ORDER BY start_date ASC LIMIT 1'
  ).get(season, today) as Tournament | undefined;

  return upcoming || null;
}

// Get the pick rotation order for a tournament
// Players rotate: for tournament N, the first picker is (N % memberCount)
export function getPickOrder(leagueId: string, tournamentId: string): { userId: string; username: string; position: number; deadline: Date }[] {
  const db = getDb();
  const members = getLeagueMembers(leagueId);
  const tournaments = getTournaments();
  const tournamentIndex = tournaments.findIndex(t => t.id === tournamentId);
  const tournament = tournaments[tournamentIndex];

  if (!tournament || members.length === 0) return [];

  const memberCount = members.length;
  // Rotate: for tournament at index N, first picker rotates
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

// Check if it's a user's turn to pick and they haven't missed their deadline
export function canUserPick(leagueId: string, userId: string, tournamentId: string): { canPick: boolean; reason: string; deadline?: Date } {
  const db = getDb();

  // Check if user already picked for this tournament
  const existingPick = db.prepare(
    'SELECT id FROM picks WHERE league_id = ? AND user_id = ? AND tournament_id = ?'
  ).get(leagueId, userId, tournamentId);

  if (existingPick) {
    return { canPick: false, reason: 'You have already made your pick for this tournament' };
  }

  const order = getPickOrder(leagueId, tournamentId);
  const userOrder = order.find(o => o.userId === userId);

  if (!userOrder) {
    return { canPick: false, reason: 'You are not a member of this league' };
  }

  const now = new Date();

  // Check if previous pickers have picked (or their deadline passed)
  for (const picker of order) {
    if (picker.position >= userOrder.position) break;

    const theirPick = db.prepare(
      'SELECT id FROM picks WHERE league_id = ? AND user_id = ? AND tournament_id = ?'
    ).get(leagueId, picker.userId, tournamentId);

    // If a previous picker hasn't picked and their deadline hasn't passed, user must wait
    if (!theirPick && now < picker.deadline) {
      return {
        canPick: false,
        reason: `Waiting for ${picker.username} to pick (deadline: ${picker.deadline.toLocaleString('en-US', { timeZone: 'America/Los_Angeles' })})`,
        deadline: userOrder.deadline,
      };
    }
  }

  // Check if user's deadline has passed
  if (now > userOrder.deadline) {
    return { canPick: false, reason: 'Your pick deadline has passed', deadline: userOrder.deadline };
  }

  return { canPick: true, reason: 'Ready to pick', deadline: userOrder.deadline };
}

export function makePick(leagueId: string, userId: string, tournamentId: string, golferId: string): Pick {
  const db = getDb();

  // Check if golfer already picked by someone else in this league for this tournament
  const golferTaken = db.prepare(
    'SELECT p.id, u.username FROM picks p JOIN users u ON p.user_id = u.id WHERE p.league_id = ? AND p.tournament_id = ? AND p.golfer_id = ?'
  ).get(leagueId, tournamentId, golferId) as { id: string; username: string } | undefined;

  if (golferTaken) {
    throw new Error(`This golfer has already been picked by ${golferTaken.username}`);
  }

  // Check if user already picked this golfer this season (one golfer per season per user)
  const alreadyUsed = db.prepare(`
    SELECT p.id, t.name as tournament_name FROM picks p
    JOIN tournaments t ON p.tournament_id = t.id
    WHERE p.league_id = ? AND p.user_id = ? AND p.golfer_id = ?
  `).get(leagueId, userId, golferId) as { id: string; tournament_name: string } | undefined;

  if (alreadyUsed) {
    throw new Error(`You already picked this golfer for ${alreadyUsed.tournament_name}. Each golfer can only be selected once per season.`);
  }

  const order = getPickOrder(leagueId, tournamentId);
  const userOrder = order.find(o => o.userId === userId);
  const pickPosition = userOrder?.position ?? 0;

  const id = uuidv4();
  db.prepare(
    'INSERT INTO picks (id, league_id, user_id, tournament_id, golfer_id, pick_order) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(id, leagueId, userId, tournamentId, golferId, pickPosition);

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

// Get golfer IDs that a user has already picked this season in a league
export function getUserUsedGolfers(leagueId: string, userId: string): string[] {
  const db = getDb();
  const rows = db.prepare(
    'SELECT golfer_id FROM picks WHERE league_id = ? AND user_id = ?'
  ).all(leagueId, userId) as { golfer_id: string }[];
  return rows.map(r => r.golfer_id);
}

export function getLeaguePicks(leagueId: string, tournamentId?: string): PickWithDetails[] {
  const db = getDb();
  let query = `
    SELECT p.*, u.username, g.name as golfer_name, t.name as tournament_name,
      COALESCE(tr.prize_money, 0) as prize_money
    FROM picks p
    JOIN users u ON p.user_id = u.id
    JOIN golfers g ON p.golfer_id = g.id
    JOIN tournaments t ON p.tournament_id = t.id
    LEFT JOIN tournament_results tr ON tr.tournament_id = p.tournament_id AND tr.golfer_id = p.golfer_id
    WHERE p.league_id = ?
  `;
  const params: string[] = [leagueId];

  if (tournamentId) {
    query += ' AND p.tournament_id = ?';
    params.push(tournamentId);
  }

  query += ' ORDER BY t.start_date ASC, p.pick_order ASC';

  return db.prepare(query).all(...params) as PickWithDetails[];
}

export function getLeagueStandings(leagueId: string): { userId: string; username: string; totalPrizeMoney: number; pickCount: number }[] {
  const db = getDb();
  const members = getLeagueMembers(leagueId);

  return members.map(member => {
    const result = db.prepare(`
      SELECT
        COALESCE(SUM(tr.prize_money), 0) as total_prize_money,
        COUNT(p.id) as pick_count
      FROM picks p
      LEFT JOIN tournament_results tr ON tr.tournament_id = p.tournament_id AND tr.golfer_id = p.golfer_id
      WHERE p.league_id = ? AND p.user_id = ?
    `).get(leagueId, member.user_id) as { total_prize_money: number; pick_count: number };

    return {
      userId: member.user_id,
      username: member.username,
      totalPrizeMoney: result.total_prize_money,
      pickCount: result.pick_count,
    };
  }).sort((a, b) => b.totalPrizeMoney - a.totalPrizeMoney);
}

export function updateTournamentResult(tournamentId: string, golferId: string, position: string, prizeMoney: number, score?: string) {
  const db = getDb();
  const id = uuidv4();

  db.prepare(`
    INSERT INTO tournament_results (id, tournament_id, golfer_id, position, prize_money, score)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(tournament_id, golfer_id) DO UPDATE SET
      position = excluded.position,
      prize_money = excluded.prize_money,
      score = excluded.score
  `).run(id, tournamentId, golferId, position, prizeMoney, score || null);
}

export function updateTournamentStatus(tournamentId: string, status: string) {
  const db = getDb();
  db.prepare('UPDATE tournaments SET status = ? WHERE id = ?').run(status, tournamentId);
}
