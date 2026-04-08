import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { getLeague } from '@/lib/leagues';
import { getLeagueStandings, getTournaments } from '@/lib/picks';
import { query, execute, queryOne } from '@/lib/db';
import { ensureSeeded } from '@/lib/seed';

// GET: Season summary with winner
export async function GET(req: NextRequest, { params }: { params: Promise<{ leagueId: string }> }) {
  await ensureSeeded();
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { leagueId } = await params;
    const league = await getLeague(leagueId);
    if (!league) return NextResponse.json({ error: 'League not found' }, { status: 404 });

    const standings = await getLeagueStandings(leagueId);
    const tournaments = await getTournaments();

    // Check if season is complete (all tournaments have ended)
    const today = new Date().toISOString().split('T')[0];
    const allComplete = tournaments.every(t => t.end_date < today);

    // Tiebreaker: most top-10 finishes, then most wins
    let tiebrokenStandings = standings;
    if (standings.length >= 2 && standings[0].totalPrizeMoney === standings[1].totalPrizeMoney) {
      const tiebreakers = await Promise.all(standings.map(async s => {
        const top10s = await queryOne<{ count: string }>(
          `SELECT COUNT(*)::int as count FROM picks p
           JOIN tournament_results tr ON tr.tournament_id = p.tournament_id AND tr.golfer_id = p.golfer_id
           WHERE p.league_id = $1 AND p.user_id = $2
           AND tr.position IN ('1','2','3','4','5','6','7','8','9','10','T1','T2','T3','T4','T5','T6','T7','T8','T9','T10')`,
          [leagueId, s.userId]
        );
        const wins = await queryOne<{ count: string }>(
          `SELECT COUNT(*)::int as count FROM picks p
           JOIN tournament_results tr ON tr.tournament_id = p.tournament_id AND tr.golfer_id = p.golfer_id
           WHERE p.league_id = $1 AND p.user_id = $2 AND tr.position IN ('1','T1')`,
          [leagueId, s.userId]
        );
        return { ...s, top10Count: Number(top10s?.count ?? 0), winCount: Number(wins?.count ?? 0) };
      }));

      tiebrokenStandings = tiebreakers.sort((a, b) => {
        if (b.totalPrizeMoney !== a.totalPrizeMoney) return b.totalPrizeMoney - a.totalPrizeMoney;
        if (b.top10Count !== a.top10Count) return b.top10Count - a.top10Count;
        return b.winCount - a.winCount;
      });
    }

    const winner = allComplete && tiebrokenStandings.length > 0 ? tiebrokenStandings[0] : null;

    return NextResponse.json({
      season: league.season,
      allComplete,
      standings: tiebrokenStandings,
      winner,
      tournamentsPlayed: tournaments.filter(t => t.end_date < today).length,
      tournamentsTotal: tournaments.length,
    });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
