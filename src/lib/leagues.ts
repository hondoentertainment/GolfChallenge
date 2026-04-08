import { query, queryOne, execute } from './db';
import { v4 as uuidv4 } from 'uuid';

export interface League {
  id: string;
  name: string;
  invite_code: string;
  created_by: string;
  season: string;
  created_at: string;
}

export interface LeagueMember {
  id: string;
  league_id: string;
  user_id: string;
  username: string;
  joined_at: string;
}

function generateInviteCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

export async function createLeague(name: string, createdBy: string, season = '2025-2026'): Promise<League> {
  const id = uuidv4();
  const inviteCode = generateInviteCode();
  const memberId = uuidv4();

  await execute(
    'INSERT INTO leagues (id, name, invite_code, created_by, season) VALUES ($1, $2, $3, $4, $5)',
    [id, name, inviteCode, createdBy, season]
  );

  await execute(
    'INSERT INTO league_members (id, league_id, user_id) VALUES ($1, $2, $3)',
    [memberId, id, createdBy]
  );

  return {
    id,
    name,
    invite_code: inviteCode,
    created_by: createdBy,
    season,
    created_at: new Date().toISOString(),
  };
}

export async function joinLeague(inviteCode: string, userId: string): Promise<League | null> {
  const league = await queryOne<League>(
    'SELECT * FROM leagues WHERE invite_code = $1',
    [inviteCode]
  );

  if (!league) return null;

  const existing = await queryOne(
    'SELECT id FROM league_members WHERE league_id = $1 AND user_id = $2',
    [league.id, userId]
  );

  if (existing) return league;

  await execute(
    'INSERT INTO league_members (id, league_id, user_id) VALUES ($1, $2, $3)',
    [uuidv4(), league.id, userId]
  );

  return league;
}

export async function getUserLeagues(userId: string): Promise<(League & { member_count: number })[]> {
  return query<League & { member_count: number }>(`
    SELECT l.*, COUNT(lm2.id)::int as member_count
    FROM leagues l
    JOIN league_members lm ON l.id = lm.league_id AND lm.user_id = $1
    JOIN league_members lm2 ON l.id = lm2.league_id
    GROUP BY l.id
    ORDER BY l.created_at DESC
  `, [userId]);
}

export async function getLeague(leagueId: string): Promise<League | null> {
  return queryOne<League>('SELECT * FROM leagues WHERE id = $1', [leagueId]);
}

export async function getLeagueMembers(leagueId: string): Promise<LeagueMember[]> {
  return query<LeagueMember>(`
    SELECT lm.*, u.username
    FROM league_members lm
    JOIN users u ON lm.user_id = u.id
    WHERE lm.league_id = $1
    ORDER BY lm.joined_at ASC
  `, [leagueId]);
}

export async function isLeagueMember(leagueId: string, userId: string): Promise<boolean> {
  const row = await queryOne(
    'SELECT id FROM league_members WHERE league_id = $1 AND user_id = $2',
    [leagueId, userId]
  );
  return !!row;
}
