import { NextResponse } from 'next/server';
import { getTournaments } from '@/lib/picks';
import { query, queryOne } from '@/lib/db';
import { ensureSeeded } from '@/lib/seed';

const ACTIVE_SEASON = '2025-2026';

// Public endpoint - no auth required
export async function GET() {
  await ensureSeeded();
  try {
    const tournaments = await getTournaments(ACTIVE_SEASON);
    const today = new Date().toISOString().split('T')[0];

    // Most recent finished event that has results (avoids empty recap when only some events are seeded)
    const lastWithResults = await queryOne<{ id: string }>(
      `SELECT t.id
       FROM tournaments t
       WHERE t.season = $1 AND t.end_date < $2
         AND EXISTS (SELECT 1 FROM tournament_results tr WHERE tr.tournament_id = t.id)
       ORDER BY t.end_date DESC
       LIMIT 1`,
      [ACTIVE_SEASON, today]
    );
    if (!lastWithResults) return NextResponse.json({ recap: null, upcoming: null });

    const lastTournament = tournaments.find((t) => t.id === lastWithResults.id);
    if (!lastTournament) return NextResponse.json({ recap: null, upcoming: null });

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
