import { NextResponse } from 'next/server';
import { getCurrentUser, logout } from '@/lib/auth';
import { ensureSeeded } from '@/lib/seed';

export async function GET() {
  await ensureSeeded();
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ user: null }, { status: 401 });
    }
    return NextResponse.json({ user });
  } catch {
    return NextResponse.json({ user: null }, { status: 401 });
  }
}

export async function DELETE() {
  try {
    await logout();
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Logout failed' }, { status: 500 });
  }
}
