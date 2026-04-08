import getDb from './db';
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

export function createLeague(name: string, createdBy: string, season = '2025-2026'): League {
  const db = getDb();
  const id = uuidv4();
  const inviteCode = generateInviteCode();
  const memberId = uuidv4();

  db.transaction(() => {
    db.prepare(
      'INSERT INTO leagues (id, name, invite_code, created_by, season) VALUES (?, ?, ?, ?, ?)'
    ).run(id, name, inviteCode, createdBy, season);

    // Auto-join creator to league
    db.prepare(
      'INSERT INTO league_members (id, league_id, user_id) VALUES (?, ?, ?)'
    ).run(memberId, id, createdBy);
  })();

  return {
    id,
    name,
    invite_code: inviteCode,
    created_by: createdBy,
    season,
    created_at: new Date().toISOString(),
  };
}

export function joinLeague(inviteCode: string, userId: string): League | null {
  const db = getDb();
  const league = db.prepare(
    'SELECT * FROM leagues WHERE invite_code = ?'
  ).get(inviteCode) as League | undefined;

  if (!league) return null;

  const existing = db.prepare(
    'SELECT id FROM league_members WHERE league_id = ? AND user_id = ?'
  ).get(league.id, userId);

  if (existing) return league; // Already a member

  db.prepare(
    'INSERT INTO league_members (id, league_id, user_id) VALUES (?, ?, ?)'
  ).run(uuidv4(), league.id, userId);

  return league;
}

export function getUserLeagues(userId: string): (League & { member_count: number })[] {
  const db = getDb();
  return db.prepare(`
    SELECT l.*, COUNT(lm2.id) as member_count
    FROM leagues l
    JOIN league_members lm ON l.id = lm.league_id AND lm.user_id = ?
    JOIN league_members lm2 ON l.id = lm2.league_id
    GROUP BY l.id
    ORDER BY l.created_at DESC
  `).all(userId) as (League & { member_count: number })[];
}

export function getLeague(leagueId: string): League | null {
  const db = getDb();
  return db.prepare('SELECT * FROM leagues WHERE id = ?').get(leagueId) as League | null;
}

export function getLeagueMembers(leagueId: string): LeagueMember[] {
  const db = getDb();
  return db.prepare(`
    SELECT lm.*, u.username
    FROM league_members lm
    JOIN users u ON lm.user_id = u.id
    WHERE lm.league_id = ?
    ORDER BY lm.joined_at ASC
  `).all(leagueId) as LeagueMember[];
}

export function isLeagueMember(leagueId: string, userId: string): boolean {
  const db = getDb();
  const row = db.prepare(
    'SELECT id FROM league_members WHERE league_id = ? AND user_id = ?'
  ).get(leagueId, userId);
  return !!row;
}
