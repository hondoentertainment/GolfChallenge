import { NextRequest, NextResponse } from 'next/server';
import { resetPasswordWithToken } from '@/lib/auth';
import { ensureSeeded } from '@/lib/seed';

export async function POST(req: NextRequest) {
  await ensureSeeded();
  try {
    const { token, password } = await req.json();
    if (!token || !password) {
      return NextResponse.json({ error: 'Token and new password are required' }, { status: 400 });
    }
    if (password.length < 6) {
      return NextResponse.json({ error: 'Password must be at least 6 characters' }, { status: 400 });
    }

    const success = await resetPasswordWithToken(token, password);
    if (!success) {
      return NextResponse.json({ error: 'Invalid or expired reset link' }, { status: 400 });
    }

    return NextResponse.json({ message: 'Password has been reset. You can now sign in.' });
  } catch {
    return NextResponse.json({ error: 'Failed to reset password' }, { status: 500 });
  }
}
