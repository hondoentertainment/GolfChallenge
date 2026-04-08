import { NextResponse } from 'next/server';
import { getTournaments } from '@/lib/picks';
import { query } from '@/lib/db';
import { ensureSeeded } from '@/lib/seed';

// Public endpoint - no auth required
export async function GET() {
  await ensureSeeded();
  try {
    const tournaments = await getTournaments();
    const today = new Date().toISOString().split('T')[0];

    // Find the most recently completed tournament
    const completed = tournaments.filter(t => t.end_date < today);
    const lastTournament = completed[completed.length - 1];
    if (!lastTournament) return NextResponse.json({ recap: null });

    // Get top results for this tournament
    const results = await query<{ golfer_name: string; position: string; prize_money: number; score: string }>(
      `SELECT g.name as golfer_name, tr.position, tr.prize_money::int, tr.score
       FROM tournament_results tr
       JOIN golfers g ON tr.golfer_id = g.id
       WHERE tr.tournament_id = $1
       ORDER BY tr.prize_money DESC
       LIMIT 10`,
      [lastTournament.id]
    );

    // Get upcoming tournament
    const upcoming = tournaments.find(t => t.start_date > today);

    return NextResponse.json({
      recap: {
        tournament: lastTournament,
        results,
      },
      upcoming,
    });
  } catch {
    return NextResponse.json({ error: 'Failed to fetch recap' }, { status: 500 });
  }
}
