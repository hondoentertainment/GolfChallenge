import { NextRequest, NextResponse } from 'next/server';
import { createPasswordResetToken } from '@/lib/auth';
import { ensureSeeded } from '@/lib/seed';

export async function POST(req: NextRequest) {
  await ensureSeeded();
  try {
    const { email } = await req.json();
    if (!email) {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 });
    }

    const token = await createPasswordResetToken(email);

    // Always return success to prevent email enumeration
    // In production, send email with reset link containing the token
    if (token) {
      // TODO: Send email with link: /reset-password?token=${token}
      console.log(`Password reset token for ${email}: ${token}`);
    }

    return NextResponse.json({
      message: 'If an account exists with that email, a reset link has been sent.',
      // In dev, return token for testing
      ...(process.env.NODE_ENV !== 'production' && token ? { token } : {}),
    });
  } catch {
    return NextResponse.json({ error: 'Failed to process reset' }, { status: 500 });
  }
}
