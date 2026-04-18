import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { updateTournamentResult, updateTournamentStatus, getTournaments, getTournament, getGolfers, reconcilePickPayouts } from '@/lib/picks';
import { syncTournamentResults, finalizeTournamentPayouts, finalizeRecentTournaments, populateHistoricalTournament } from '@/lib/pga-data';
import { notifyLeagueMembers } from '@/lib/notifications';
import { recalculateBadges } from '@/lib/badges';
import { logAction } from '@/lib/audit';
import { query } from '@/lib/db';
import { ensureSeeded } from '@/lib/seed';
import { calculatePrizeMoney, parsePosition } from '@/lib/pga-schedule';

// GET: list tournaments and golfers for admin form
export async function GET() {
  await ensureSeeded();
  try {
    const user = await getCurrentUser();
    if (!user?.is_admin) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }
    const tournaments = await getTournaments();
    const golfers = await getGolfers();
    return NextResponse.json({ tournaments, golfers });
  } catch {
    return NextResponse.json({ error: 'Failed to fetch data' }, { status: 500 });
  }
}

// POST: enter or sync results
export async function POST(req: NextRequest) {
  await ensureSeeded();
  try {
    const user = await getCurrentUser();
    if (!user?.is_admin) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    const body = await req.json();

    // Auto-sync from ESPN
    if (body.action === 'sync') {
      const result = await syncTournamentResults(body.tournamentId);
      // Fix 5: if ESPN live scoreboard is empty for this tournament, fall back
      // to historical fetch so admin always gets a populated leaderboard.
      let historicalPopulated = 0;
      if (!result.espnHadEvent || result.updated === 0) {
        const hist = await populateHistoricalTournament(body.tournamentId);
        historicalPopulated = hist.populated;
      }
      const reconciled = await reconcilePickPayouts();
      return NextResponse.json({ ...result, historicalPopulated, reconciled });
    }

    // Finalize a specific tournament (sync + reconcile + mark completed + notify)
    if (body.action === 'finalize') {
      if (!body.tournamentId) return NextResponse.json({ error: 'tournamentId required' }, { status: 400 });
      const result = await finalizeTournamentPayouts(body.tournamentId);
      return NextResponse.json(result);
    }

    // Finalize all recently ended tournaments that aren't marked completed
    if (body.action === 'finalize-all') {
      const result = await finalizeRecentTournaments();
      return NextResponse.json(result);
    }

    // Populate a completed tournament from ESPN historical data (pulls full field)
    if (body.action === 'populate-historical') {
      if (!body.tournamentId) return NextResponse.json({ error: 'tournamentId required' }, { status: 400 });
      const result = await populateHistoricalTournament(body.tournamentId);
      await reconcilePickPayouts();
      return NextResponse.json(result);
    }

    // Reconcile all picks (backfill missing payouts)
    if (body.action === 'reconcile') {
      const reconciled = await reconcilePickPayouts();
      return NextResponse.json(reconciled);
    }

    // Manual result entry
    const { tournamentId, results, status } = body;
    if (!tournamentId || !results || !Array.isArray(results)) {
      return NextResponse.json({ error: 'tournamentId and results array required' }, { status: 400 });
    }

    const tournament = await getTournament(tournamentId);
    const purse = tournament?.purse ?? 0;
    const tournamentName = tournament?.name;

    let updated = 0;
    for (const r of results) {
      if (r.golferId && r.position !== undefined) {
        const posStr = String(r.position);
        const prizeMoney = r.prizeMoney > 0
          ? r.prizeMoney
          : calculatePrizeMoney(purse, parsePosition(posStr), tournamentName);
        await updateTournamentResult(tournamentId, r.golferId, posStr, prizeMoney, r.score);
        updated++;
      }
    }

    if (status) {
      await updateTournamentStatus(tournamentId, status);
    }

    // Notify all leagues that have picks for this tournament
    const leagues = await query<{ league_id: string }>(
      'SELECT DISTINCT league_id FROM picks WHERE tournament_id = $1',
      [tournamentId]
    );
    for (const l of leagues) {
      await notifyLeagueMembers(l.league_id, user.id, 'results', 'Tournament results updated', `Results for the tournament have been entered. Check your standings!`);
      await recalculateBadges(l.league_id);
    }

    await logAction('results_entered', `Updated ${updated} results`, undefined, user.id);

    return NextResponse.json({ updated });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Failed to update results';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
