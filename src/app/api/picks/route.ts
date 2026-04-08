import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { getUserLeagues } from '@/lib/leagues';
import { getLeaguePicks } from '@/lib/picks';
import { ensureSeeded } from '@/lib/seed';

export async function GET() {
  await ensureSeeded();
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const leagues = await getUserLeagues(user.id);
    const allPicks = [];
    for (const league of leagues) {
      const picks = await getLeaguePicks(league.id);
      allPicks.push(...picks.filter(p => p.user_id === user.id));
    }

    return NextResponse.json({ picks: allPicks });
  } catch {
    return NextResponse.json({ error: 'Failed to fetch picks' }, { status: 500 });
  }
}
