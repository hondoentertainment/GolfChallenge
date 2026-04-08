import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { getLeague, getLeagueMembers, isLeagueMember } from '@/lib/leagues';
import { ensureSeeded } from '@/lib/seed';

export async function GET(req: NextRequest, { params }: { params: Promise<{ leagueId: string }> }) {
  ensureSeeded();
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { leagueId } = await params;

    if (!isLeagueMember(leagueId, user.id)) {
      return NextResponse.json({ error: 'Not a member of this league' }, { status: 403 });
    }

    const league = getLeague(leagueId);
    const members = getLeagueMembers(leagueId);

    return NextResponse.json({ league, members });
  } catch {
    return NextResponse.json({ error: 'Failed to fetch league' }, { status: 500 });
  }
}
