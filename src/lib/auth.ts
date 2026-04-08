import { cookies } from 'next/headers';
import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { SignJWT, jwtVerify } from 'jose';
import { queryOne, execute } from './db';

export interface User {
  id: string;
  username: string;
  email: string;
  is_admin: boolean;
}

const SESSION_COOKIE = 'golf_session';
const JWT_SECRET = new TextEncoder().encode(process.env.JWT_SECRET || 'golf-challenge-dev-secret-change-in-prod');

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
  const token = await new SignJWT({ sub: userId })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('30d')
    .sign(JWT_SECRET);
  return token;
}

export async function setSessionCookie(token: string) {
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 30,
    path: '/',
  });
}

export async function getCurrentUser(): Promise<User | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  try {
    const { payload } = await jwtVerify(token, JWT_SECRET);
    const userId = payload.sub;
    if (!userId) return null;

    const row = await queryOne<User>(
      'SELECT id, username, email, is_admin FROM users WHERE id = $1',
      [userId]
    );
    return row || null;
  } catch {
    return null;
  }
}

export async function logout() {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE);
}

export async function createPasswordResetToken(email: string): Promise<string | null> {
  const user = await queryOne<{ id: string }>('SELECT id FROM users WHERE email = $1', [email.toLowerCase()]);
  if (!user) return null;
  const token = crypto.randomBytes(32).toString('hex');
  const id = uuidv4();
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000);
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
  return true;
}

// Simple in-memory rate limiter for serverless
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

export function checkRateLimit(key: string, maxRequests: number, windowMs: number): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(key);
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (entry.count >= maxRequests) return false;
  entry.count++;
  return true;
}
