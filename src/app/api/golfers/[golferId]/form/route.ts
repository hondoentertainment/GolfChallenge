import { NextRequest, NextResponse } from 'next/server';
import { query, queryOne } from '@/lib/db';
import { ensureSeeded } from '@/lib/seed';

export async function GET(req: NextRequest, { params }: { params: Promise<{ golferId: string }> }) {
  await ensureSeeded();
  try {
    const { golferId } = await params;

    const golfer = await queryOne<{ id: string; name: string; world_ranking: number; country: string }>(
      'SELECT * FROM golfers WHERE id = $1', [golferId]
    );
    if (!golfer) return NextResponse.json({ error: 'Golfer not found' }, { status: 404 });

    const seasonResults = await query<{
      tournament_name: string;
      position: string;
      prize_money: number;
      score: string;
      start_date: string;
    }>(`
      SELECT t.name as tournament_name, tr.position, tr.prize_money::int, tr.score, t.start_date
      FROM tournament_results tr
      JOIN tournaments t ON tr.tournament_id = t.id
      WHERE tr.golfer_id = $1 AND t.season = $2
      ORDER BY t.start_date DESC
    `, [golferId, '2025-2026']);

    const recentResults = seasonResults.slice(0, 5);

    const seasonTotalEarnings = seasonResults.reduce((s, r) => s + (r.prize_money || 0), 0);
    const seasonEvents = seasonResults.length;
    const recentEarnings = recentResults.reduce((s, r) => s + (r.prize_money || 0), 0);
    const avgEarnings = recentResults.length > 0 ? Math.round(recentEarnings / recentResults.length) : 0;

    const top10s = seasonResults.filter(r => {
      const pos = parseInt(r.position?.replace('T', '') || '999');
      return pos <= 10;
    }).length;

    return NextResponse.json({
      golfer,
      recentResults,
      stats: {
        totalEarnings: seasonTotalEarnings,
        avgEarnings,
        top10s,
        events: seasonEvents,
      },
    });
  } catch {
    return NextResponse.json({ error: 'Failed to fetch form' }, { status: 500 });
  }
}
