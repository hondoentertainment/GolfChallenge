import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { isLeagueMember } from '@/lib/leagues';
import { getLeagueStandings } from '@/lib/picks';
import { ensureSeeded } from '@/lib/seed';

export async function GET(req: NextRequest, { params }: { params: Promise<{ leagueId: string }> }) {
  await ensureSeeded();
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { leagueId } = await params;

    if (!(await isLeagueMember(leagueId, user.id))) {
      return NextResponse.json({ error: 'Not a member of this league' }, { status: 403 });
    }

    const standings = await getLeagueStandings(leagueId);
    return NextResponse.json({ standings });
  } catch {
    return NextResponse.json({ error: 'Failed to fetch standings' }, { status: 500 });
  }
}
