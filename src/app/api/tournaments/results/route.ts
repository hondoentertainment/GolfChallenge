import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { ensureSeeded } from '@/lib/seed';

export async function GET() {
  await ensureSeeded();
  try {
    const rows = await query<{
      tournament_id: string;
      tournament_name: string;
      golfer_name: string;
      position: string;
      prize_money: number;
      score: string;
    }>(`
      SELECT
        t.id as tournament_id,
        t.name as tournament_name,
        g.name as golfer_name,
        tr.position,
        tr.prize_money::int as prize_money,
        tr.score
      FROM tournament_results tr
      JOIN tournaments t ON t.id = tr.tournament_id
      JOIN golfers g ON g.id = tr.golfer_id
      WHERE t.season = $1
      ORDER BY t.start_date ASC, tr.prize_money DESC, tr.position ASC
    `, ['2025-2026']);

    const grouped: Record<string, { tournamentId: string; tournamentName: string; results: { golferName: string; position: string; prizeMoney: number; score: string }[] }> = {};

    for (const r of rows) {
      if (!grouped[r.tournament_id]) {
        grouped[r.tournament_id] = {
          tournamentId: r.tournament_id,
          tournamentName: r.tournament_name,
          results: [],
        };
      }
      grouped[r.tournament_id].results.push({
        golferName: r.golfer_name,
        position: r.position,
        prizeMoney: r.prize_money,
        score: r.score,
      });
    }

    return NextResponse.json({ results: Object.values(grouped) });
  } catch {
    return NextResponse.json({ error: 'Failed to fetch results' }, { status: 500 });
  }
}
