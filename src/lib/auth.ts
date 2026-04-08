import { cookies } from 'next/headers';
import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcryptjs';
import getDb from './db';

export interface User {
  id: string;
  username: string;
  email: string;
}

const SESSION_COOKIE = 'golf_session';

// Simple in-memory session store (in production, use DB or Redis)
const sessions = new Map<string, string>(); // sessionId -> userId

export async function createUser(username: string, email: string, password: string): Promise<User> {
  const db = getDb();
  const id = uuidv4();
  const passwordHash = await bcrypt.hash(password, 10);

  try {
    db.prepare(
      'INSERT INTO users (id, username, email, password_hash) VALUES (?, ?, ?, ?)'
    ).run(id, username, email.toLowerCase(), passwordHash);
  } catch {
    throw new Error('Username or email already exists');
  }

  return { id, username, email: email.toLowerCase() };
}

export async function authenticateUser(email: string, password: string): Promise<User | null> {
  const db = getDb();
  const row = db.prepare(
    'SELECT id, username, email, password_hash FROM users WHERE email = ?'
  ).get(email.toLowerCase()) as { id: string; username: string; email: string; password_hash: string } | undefined;

  if (!row) return null;

  const valid = await bcrypt.compare(password, row.password_hash);
  if (!valid) return null;

  return { id: row.id, username: row.username, email: row.email };
}

export async function createSession(userId: string): Promise<string> {
  const sessionId = uuidv4();
  sessions.set(sessionId, userId);
  return sessionId;
}

export async function setSessionCookie(sessionId: string) {
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, sessionId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 30, // 30 days
    path: '/',
  });
}

export async function getCurrentUser(): Promise<User | null> {
  const cookieStore = await cookies();
  const sessionId = cookieStore.get(SESSION_COOKIE)?.value;
  if (!sessionId) return null;

  const userId = sessions.get(sessionId);
  if (!userId) return null;

  const db = getDb();
  const row = db.prepare(
    'SELECT id, username, email FROM users WHERE id = ?'
  ).get(userId) as User | undefined;

  return row || null;
}

export async function logout() {
  const cookieStore = await cookies();
  const sessionId = cookieStore.get(SESSION_COOKIE)?.value;
  if (sessionId) {
    sessions.delete(sessionId);
  }
  cookieStore.delete(SESSION_COOKIE);
}
