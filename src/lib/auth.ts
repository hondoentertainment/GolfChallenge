import { cookies } from 'next/headers';
import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcryptjs';
import { query, queryOne, execute } from './db';

export interface User {
  id: string;
  username: string;
  email: string;
}

const SESSION_COOKIE = 'golf_session';

export async function createUser(username: string, email: string, password: string): Promise<User> {
  const id = uuidv4();
  const passwordHash = await bcrypt.hash(password, 10);

  try {
    await execute(
      'INSERT INTO users (id, username, email, password_hash) VALUES ($1, $2, $3, $4)',
      [id, username, email.toLowerCase(), passwordHash]
    );
  } catch {
    throw new Error('Username or email already exists');
  }

  return { id, username, email: email.toLowerCase() };
}

export async function authenticateUser(email: string, password: string): Promise<User | null> {
  const row = await queryOne<{ id: string; username: string; email: string; password_hash: string }>(
    'SELECT id, username, email, password_hash FROM users WHERE email = $1',
    [email.toLowerCase()]
  );

  if (!row) return null;

  const valid = await bcrypt.compare(password, row.password_hash);
  if (!valid) return null;

  return { id: row.id, username: row.username, email: row.email };
}

export async function createSession(userId: string): Promise<string> {
  const sessionId = uuidv4();
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days
  await execute(
    'INSERT INTO sessions (id, user_id, expires_at) VALUES ($1, $2, $3)',
    [sessionId, userId, expiresAt.toISOString()]
  );
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

  const row = await queryOne<{ id: string; username: string; email: string }>(
    `SELECT u.id, u.username, u.email
     FROM sessions s
     JOIN users u ON s.user_id = u.id
     WHERE s.id = $1 AND s.expires_at > NOW()`,
    [sessionId]
  );

  return row || null;
}

export async function logout() {
  const cookieStore = await cookies();
  const sessionId = cookieStore.get(SESSION_COOKIE)?.value;
  if (sessionId) {
    await execute('DELETE FROM sessions WHERE id = $1', [sessionId]);
  }
  cookieStore.delete(SESSION_COOKIE);
}
