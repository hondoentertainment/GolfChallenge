import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { isLeagueMember } from '@/lib/leagues';
import { getUserBadges, getBadgeDefs } from '@/lib/badges';
import { query } from '@/lib/db';
import { ensureSeeded } from '@/lib/seed';

export async function GET(req: NextRequest, { params }: { params: Promise<{ leagueId: string }> }) {
  await ensureSeeded();
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { leagueId } = await params;
    if (!(await isLeagueMember(leagueId, user.id))) {
      return NextResponse.json({ error: 'Not a member' }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const playerId = searchParams.get('playerId') || user.id;

    const badges = await getUserBadges(playerId, leagueId);
    const allBadges = await query<{ user_id: string; badge_type: string; label: string; username: string }>(
      `SELECT b.user_id, b.badge_type, b.label, u.username
       FROM badges b JOIN users u ON b.user_id = u.id
       WHERE b.league_id = $1 ORDER BY b.earned_at DESC`,
      [leagueId]
    );

    return NextResponse.json({ badges, allBadges, defs: getBadgeDefs() });
  } catch {
    return NextResponse.json({ error: 'Failed to fetch badges' }, { status: 500 });
  }
}
