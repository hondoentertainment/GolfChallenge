import { NextRequest, NextResponse } from 'next/server';
import { authenticateUser, createSession, setSessionCookie, checkRateLimit } from '@/lib/auth';
import { ensureSeeded } from '@/lib/seed';

export async function POST(req: NextRequest) {
  await ensureSeeded();
  try {
    const ip = req.headers.get('x-forwarded-for') || 'unknown';
    if (!checkRateLimit(`login:${ip}`, 10, 60000)) {
      return NextResponse.json({ error: 'Too many attempts. Try again in a minute.' }, { status: 429 });
    }

    const { email, password } = await req.json();
    if (!email || !password) {
      return NextResponse.json({ error: 'Email and password are required' }, { status: 400 });
    }

    const user = await authenticateUser(email, password);
    if (!user) {
      return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 });
    }

    const token = await createSession(user.id);
    await setSessionCookie(token);
    return NextResponse.json({ user: { id: user.id, username: user.username, email: user.email, is_admin: user.is_admin } });
  } catch {
    return NextResponse.json({ error: 'Login failed' }, { status: 500 });
  }
}
