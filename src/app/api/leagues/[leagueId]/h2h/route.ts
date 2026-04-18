import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { isLeagueMember } from '@/lib/leagues';
import { ensurePayoutsReconciled } from '@/lib/picks';
import { query } from '@/lib/db';
import { ensureSeeded } from '@/lib/seed';

export async function GET(req: NextRequest, { params }: { params: Promise<{ leagueId: string }> }) {
  await ensureSeeded();
  await ensurePayoutsReconciled();
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { leagueId } = await params;
    if (!(await isLeagueMember(leagueId, user.id))) {
      return NextResponse.json({ error: 'Not a member' }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const player1 = searchParams.get('player1');
    const player2 = searchParams.get('player2');

    if (!player1 || !player2) {
      return NextResponse.json({ error: 'player1 and player2 query params required' }, { status: 400 });
    }

    // Get picks for both players across all tournaments
    const matchups = await query<{
      tournament_name: string;
      tournament_id: string;
      start_date: string;
      p1_golfer: string;
      p1_prize: number;
      p2_golfer: string;
      p2_prize: number;
    }>(`
      SELECT
        t.name as tournament_name,
        t.id as tournament_id,
        t.start_date,
        g1.name as p1_golfer,
        COALESCE(tr1.prize_money, 0)::int as p1_prize,
        g2.name as p2_golfer,
        COALESCE(tr2.prize_money, 0)::int as p2_prize
      FROM tournaments t
      LEFT JOIN picks pk1 ON pk1.tournament_id = t.id AND pk1.league_id = $1 AND pk1.user_id = $2
      LEFT JOIN picks pk2 ON pk2.tournament_id = t.id AND pk2.league_id = $1 AND pk2.user_id = $3
      LEFT JOIN golfers g1 ON pk1.golfer_id = g1.id
      LEFT JOIN golfers g2 ON pk2.golfer_id = g2.id
      LEFT JOIN tournament_results tr1 ON tr1.tournament_id = t.id AND tr1.golfer_id = pk1.golfer_id
      LEFT JOIN tournament_results tr2 ON tr2.tournament_id = t.id AND tr2.golfer_id = pk2.golfer_id
      WHERE t.season = '2025-2026' AND (pk1.id IS NOT NULL OR pk2.id IS NOT NULL)
      ORDER BY t.start_date ASC
    `, [leagueId, player1, player2]);

    const p1Total = matchups.reduce((sum, m) => sum + m.p1_prize, 0);
    const p2Total = matchups.reduce((sum, m) => sum + m.p2_prize, 0);
    const p1Wins = matchups.filter(m => m.p1_prize > m.p2_prize).length;
    const p2Wins = matchups.filter(m => m.p2_prize > m.p1_prize).length;

    return NextResponse.json({ matchups, p1Total, p2Total, p1Wins, p2Wins });
  } catch {
    return NextResponse.json({ error: 'Failed to fetch matchup' }, { status: 500 });
  }
}
