import { NextRequest, NextResponse } from 'next/server';
import { createUser, createSession, setSessionCookie, checkRateLimit } from '@/lib/auth';
import { ensureSeeded } from '@/lib/seed';

export async function POST(req: NextRequest) {
  await ensureSeeded();
  try {
    const ip = req.headers.get('x-forwarded-for') || 'unknown';
    if (!checkRateLimit(`register:${ip}`, 5, 60000)) {
      return NextResponse.json({ error: 'Too many attempts. Try again in a minute.' }, { status: 429 });
    }

    const { username, email, password } = await req.json();
    if (!username || !email || !password) {
      return NextResponse.json({ error: 'All fields are required' }, { status: 400 });
    }
    if (password.length < 6) {
      return NextResponse.json({ error: 'Password must be at least 6 characters' }, { status: 400 });
    }

    const user = await createUser(username, email, password);
    const token = await createSession(user.id);
    await setSessionCookie(token);
    return NextResponse.json({ user });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Registration failed';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
