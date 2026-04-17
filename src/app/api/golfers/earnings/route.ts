import { NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { ensureSeeded } from '@/lib/seed';

// Returns every golfer with the total prize money they have attained this season
// (aggregated across all tournament_results for the current season).
export async function GET() {
  await ensureSeeded();
  try {
    // Only aggregate results whose position is numeric (e.g. "1", "T5") so MC/CUT/WD don't
    // poison the integer cast used for the top-10 tally.
    const rows = await query<{
      id: string;
      name: string;
      world_ranking: number;
      country: string;
      season_earnings: number;
      events_played: number;
      wins: number;
      top_10s: number;
    }>(`
      SELECT
        g.id,
        g.name,
        g.world_ranking,
        g.country,
        COALESCE(SUM(tr.prize_money), 0)::bigint as season_earnings,
        COUNT(tr.id) as events_played,
        COUNT(CASE WHEN tr.position IN ('1', 'T1') THEN 1 END) as wins,
        COUNT(CASE WHEN tr.position IN (
          '1','2','3','4','5','6','7','8','9','10',
          'T1','T2','T3','T4','T5','T6','T7','T8','T9','T10'
        ) THEN 1 END) as top_10s
      FROM golfers g
      LEFT JOIN tournament_results tr ON tr.golfer_id = g.id
      LEFT JOIN tournaments t ON t.id = tr.tournament_id AND t.season = $1
      GROUP BY g.id, g.name, g.world_ranking, g.country
      ORDER BY season_earnings DESC, g.world_ranking ASC
    `, ['2025-2026']);

    return NextResponse.json({
      season: '2025-2026',
      golfers: rows.map(r => ({
        id: r.id,
        name: r.name,
        worldRanking: r.world_ranking,
        country: r.country,
        seasonEarnings: Number(r.season_earnings),
        eventsPlayed: Number(r.events_played),
        wins: Number(r.wins),
        top10s: Number(r.top_10s),
      })),
    });
  } catch {
    return NextResponse.json({ error: 'Failed to fetch golfer earnings' }, { status: 500 });
  }
}
