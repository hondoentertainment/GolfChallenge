import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { getUserLeagues } from '@/lib/leagues';
import { getLeaguePicks } from '@/lib/picks';
import { ensureSeeded } from '@/lib/seed';

export async function GET() {
  ensureSeeded();
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const leagues = getUserLeagues(user.id);
    const allPicks = leagues.flatMap(league => {
      const picks = getLeaguePicks(league.id);
      return picks.filter(p => p.user_id === user.id);
    });

    return NextResponse.json({ picks: allPicks });
  } catch {
    return NextResponse.json({ error: 'Failed to fetch picks' }, { status: 500 });
  }
}
