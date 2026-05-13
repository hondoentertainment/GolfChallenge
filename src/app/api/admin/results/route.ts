import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { updateTournamentResult, updateTournamentStatus, getTournaments, getTournament, getGolfers, reconcilePickPayouts, syncPursesAndRecalculateParticipantTotals, recalculateTournamentResultPayoutsFromPurse, recalculateAllTournamentResultPayoutsFromPurses } from '@/lib/picks';
import { syncTournamentResults, finalizeTournamentPayouts, finalizeRecentTournaments, populateHistoricalTournament, populateAllCompletedTournaments, getTournamentCoverage, refreshLastCompletedTournaments, refreshAllCompletedTournamentFinishes } from '@/lib/pga-data';
import { notifyLeagueMembers } from '@/lib/notifications';
import { recalculateBadges } from '@/lib/badges';
import { logAction } from '@/lib/audit';
import { query, queryOne } from '@/lib/db';
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
      await recalculateTournamentResultPayoutsFromPurse(body.tournamentId);
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
      await recalculateTournamentResultPayoutsFromPurse(body.tournamentId);
      return NextResponse.json(result);
    }

    // Populate EVERY completed tournament in the season from ESPN historical data.
    // Idempotent: does not overwrite rows that already have prize_money > 0.
    if (body.action === 'populate-all') {
      const result = await populateAllCompletedTournaments();
      await reconcilePickPayouts();
      const tieTableRecalc = await recalculateAllTournamentResultPayoutsFromPurses('2025-2026');
      return NextResponse.json({ ...result, tieTableRecalc });
    }

    /** Force ESPN refresh for every completed event + purse tie table + reconcile + badges. */
    if (body.action === 'refresh-all-completed-finishes') {
      const result = await refreshAllCompletedTournamentFinishes();
      await logAction(
        'refresh_all_completed_finishes',
        `populate +${result.populateAll.totalPopulated}; payouts ${result.resultRowsUpdated} rows; reconcile +${result.reconciled.created}/${result.reconciled.updated}`,
        undefined,
        user.id,
      );
      return NextResponse.json(result);
    }

    // Coverage report: how many golfers each tournament has populated results for,
    // plus how many picks still have no matching result row.
    if (body.action === 'coverage') {
      const coverage = await getTournamentCoverage();
      return NextResponse.json(coverage);
    }

    /** Force ESPN historical + PGA purse table for the last N completed tournaments (fixes stale $). */
    if (body.action === 'refresh-last-completed') {
      const count =
        typeof body.count === 'number' && Number.isInteger(body.count) && body.count > 0 && body.count <= 20
          ? body.count
          : 5;
      const result = await refreshLastCompletedTournaments(count);
      await logAction(
        'refresh_last_completed',
        `${count} tournaments: ${result.tournaments.map((t) => t.name).join('; ')}; reconciled +${result.reconciled.created}/${result.reconciled.updated}`,
        undefined,
        user.id,
      );
      return NextResponse.json(result);
    }

    if (body.action === 'refresh-purse-payouts') {
      const result = await syncPursesAndRecalculateParticipantTotals('2025-2026');
      const leagues = await query<{ league_id: string }>(
        `SELECT DISTINCT p.league_id FROM picks p
         JOIN tournaments t ON t.id = p.tournament_id
         WHERE t.season = '2025-2026'`,
      );
      for (const l of leagues) {
        await recalculateBadges(l.league_id);
      }
      await logAction(
        'purse_payout_refresh',
        `Purse sync: ${result.pursesUpdated} tournaments updated; ${result.resultRowsUpdated} payouts recalculated; reconcile +${result.reconciled.created}/${result.reconciled.updated}; badges ${leagues.length} leagues`,
        undefined,
        user.id,
      );
      return NextResponse.json({ ...result, badgesRefreshed: leagues.length });
    }

    /** Full pipeline: finalize recent → ESPN populate-all → reconcile → purse sync & table payouts → coverage stats → badges */
    if (body.action === 'update-all-payouts') {
      const finalized = await finalizeRecentTournaments();
      const populateAll = await populateAllCompletedTournaments();
      const reconcileAfterPopulate = await reconcilePickPayouts();
      const purseSync = await syncPursesAndRecalculateParticipantTotals('2025-2026');
      const coverage = await getTournamentCoverage();
      const seasonTotalRow = await queryOne<{ total: string }>(
        `SELECT COALESCE(SUM(tr.prize_money), 0)::text as total
         FROM tournament_results tr
         JOIN tournaments t ON t.id = tr.tournament_id
         WHERE t.season = '2025-2026'`,
      );
      const totalResultRows = coverage.tournaments.reduce((s, t) => s + t.resultRows, 0);
      const totalPicksMissingResults = coverage.tournaments.reduce((s, t) => s + t.pickedWithoutResult, 0);
      const tournamentsWithGaps = coverage.tournaments.filter((t) => t.pickedWithoutResult > 0).length;

      const leagues = await query<{ league_id: string }>(
        `SELECT DISTINCT p.league_id FROM picks p
         JOIN tournaments t ON t.id = p.tournament_id
         WHERE t.season = '2025-2026'`,
      );
      for (const l of leagues) {
        await recalculateBadges(l.league_id);
      }

      await logAction(
        'full_payout_update',
        `finalize ${finalized.finalized?.length ?? 0}; populate +${populateAll.totalPopulated}; purse ${purseSync.resultRowsUpdated} rows; picks missing results ${totalPicksMissingResults}`,
        undefined,
        user.id,
      );

      return NextResponse.json({
        finalized,
        populateAll,
        reconcileAfterPopulate,
        purseSync,
        coverage,
        stats: {
          totalResultRows,
          totalPicksMissingResults,
          tournamentsWithGaps,
          seasonPrizeMoneyReported: Number(seasonTotalRow?.total ?? 0),
        },
        badgesRefreshed: leagues.length,
      });
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
    let anyExplicitPrize = false;
    for (const r of results) {
      if (r.golferId && r.position !== undefined) {
        const posStr = String(r.position);
        const rawPrize = Number(r.prizeMoney);
        if (rawPrize > 0) anyExplicitPrize = true;
        const prizeMoney = rawPrize > 0
          ? rawPrize
          : calculatePrizeMoney(purse, parsePosition(posStr), tournamentName);
        await updateTournamentResult(tournamentId, r.golferId, posStr, prizeMoney, r.score);
        updated++;
      }
    }

    if (status) {
      await updateTournamentStatus(tournamentId, status);
    }

    if (!anyExplicitPrize && updated > 0) {
      await recalculateTournamentResultPayoutsFromPurse(tournamentId);
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
