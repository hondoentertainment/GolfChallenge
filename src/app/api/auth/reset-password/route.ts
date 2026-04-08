import { NextRequest, NextResponse } from 'next/server';
import { createPasswordResetToken, checkRateLimit } from '@/lib/auth';
import { sendPasswordResetEmail } from '@/lib/email';
import { ensureSeeded } from '@/lib/seed';

export async function POST(req: NextRequest) {
  await ensureSeeded();
  try {
    const ip = req.headers.get('x-forwarded-for') || 'unknown';
    if (!checkRateLimit(`reset:${ip}`, 3, 300000)) {
      return NextResponse.json({ error: 'Too many requests. Try again in 5 minutes.' }, { status: 429 });
    }

    const { email } = await req.json();
    if (!email) {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 });
    }

    const token = await createPasswordResetToken(email);
    if (token) {
      await sendPasswordResetEmail(email, token);
    }

    // Always return success to prevent email enumeration
    return NextResponse.json({ message: 'If an account exists with that email, a reset link has been sent.' });
  } catch {
    return NextResponse.json({ error: 'Failed to process reset' }, { status: 500 });
  }
}
