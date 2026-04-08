import { cookies } from 'next/headers';
import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { queryOne, execute } from './db';

export interface User {
  id: string;
  username: string;
  email: string;
  is_admin: boolean;
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

  return { id, username, email: email.toLowerCase(), is_admin: false };
}

export async function authenticateUser(email: string, password: string): Promise<User | null> {
  const row = await queryOne<{ id: string; username: string; email: string; password_hash: string; is_admin: boolean }>(
    'SELECT id, username, email, password_hash, is_admin FROM users WHERE email = $1',
    [email.toLowerCase()]
  );

  if (!row) return null;

  const valid = await bcrypt.compare(password, row.password_hash);
  if (!valid) return null;

  return { id: row.id, username: row.username, email: row.email, is_admin: row.is_admin };
}

export async function createSession(userId: string): Promise<string> {
  const sessionId = uuidv4();
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
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
    maxAge: 60 * 60 * 24 * 30,
    path: '/',
  });
}

export async function getCurrentUser(): Promise<User | null> {
  const cookieStore = await cookies();
  const sessionId = cookieStore.get(SESSION_COOKIE)?.value;
  if (!sessionId) return null;

  const row = await queryOne<User>(
    `SELECT u.id, u.username, u.email, u.is_admin
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

// Password reset
export async function createPasswordResetToken(email: string): Promise<string | null> {
  const user = await queryOne<{ id: string }>('SELECT id FROM users WHERE email = $1', [email.toLowerCase()]);
  if (!user) return null;

  const token = crypto.randomBytes(32).toString('hex');
  const id = uuidv4();
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

  await execute(
    'INSERT INTO password_resets (id, user_id, token, expires_at) VALUES ($1, $2, $3, $4)',
    [id, user.id, token, expiresAt.toISOString()]
  );

  return token;
}

export async function resetPasswordWithToken(token: string, newPassword: string): Promise<boolean> {
  const reset = await queryOne<{ user_id: string }>(
    'SELECT user_id FROM password_resets WHERE token = $1 AND expires_at > NOW() AND used = FALSE',
    [token]
  );

  if (!reset) return false;

  const passwordHash = await bcrypt.hash(newPassword, 10);
  await execute('UPDATE users SET password_hash = $1 WHERE id = $2', [passwordHash, reset.user_id]);
  await execute('UPDATE password_resets SET used = TRUE WHERE token = $1', [token]);
  // Clear existing sessions for the user
  await execute('DELETE FROM sessions WHERE user_id = $1', [reset.user_id]);

  return true;
}
