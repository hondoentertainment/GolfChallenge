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
    const playerId = searchParams.get('playerId') || user.id;

    const picks = await query<{
      tournament_name: string;
      tournament_id: string;
      start_date: string;
      golfer_name: string;
      position: string | null;
      prize_money: number;
      score: string | null;
      purse: number;
    }>(`
      SELECT
        t.name as tournament_name,
        t.id as tournament_id,
        t.start_date,
        t.purse,
        g.name as golfer_name,
        tr.position,
        COALESCE(tr.prize_money, 0)::int as prize_money,
        tr.score
      FROM picks p
      JOIN tournaments t ON p.tournament_id = t.id
      JOIN golfers g ON p.golfer_id = g.id
      LEFT JOIN tournament_results tr ON tr.tournament_id = t.id AND tr.golfer_id = g.id
      WHERE p.league_id = $1 AND p.user_id = $2
      ORDER BY t.start_date ASC
    `, [leagueId, playerId]);

    const totalEarnings = picks.reduce((sum, p) => sum + p.prize_money, 0);
    const bestWeek = picks.reduce((best, p) => p.prize_money > best.prize_money ? p : best, picks[0] || { prize_money: 0 });

    return NextResponse.json({ picks, totalEarnings, bestWeek, playerId });
  } catch {
    return NextResponse.json({ error: 'Failed to fetch history' }, { status: 500 });
  }
}
