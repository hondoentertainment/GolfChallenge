import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { getCombinedLeaderboard } from '@/lib/picks';
import { ensureSeeded } from '@/lib/seed';

export async function GET() {
  await ensureSeeded();
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const leaderboard = await getCombinedLeaderboard(user.id);
    const totalEarnings = leaderboard.reduce((s, l) => s + l.totalPrizeMoney, 0);

    return NextResponse.json({ leaderboard, totalEarnings });
  } catch {
    return NextResponse.json({ error: 'Failed to fetch leaderboard' }, { status: 500 });
  }
}
