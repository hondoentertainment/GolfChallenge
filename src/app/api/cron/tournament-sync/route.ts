import { verifyCronAuth } from '@/lib/cron-auth';
import { NextRequest, NextResponse } from 'next/server';
import { syncTournamentResults } from '@/lib/pga-data';
import { getCurrentTournament, getTournaments, reconcilePickPayouts } from '@/lib/picks';
import { recalculateBadges } from '@/lib/badges';
import { notifyLeagueMembers } from '@/lib/notifications';
import { logAction } from '@/lib/audit';
import { query } from '@/lib/db';
import { ensureSeeded } from '@/lib/seed';

export async function GET(req: NextRequest) {
  const authError = verifyCronAuth(req);
  if (authError) return authError;
  await ensureSeeded();
  try {
    const tournament = await getCurrentTournament();
    if (!tournament) return NextResponse.json({ message: 'No active tournament' });

    const today = new Date().toISOString().split('T')[0];
    const isActive = tournament.start_date <= today && tournament.end_date >= today;
    if (!isActive) return NextResponse.json({ message: 'Tournament not in progress' });

    const result = await syncTournamentResults(tournament.id);

    if (result.updated > 0) {
      const leagues = await query<{ league_id: string }>(
        'SELECT DISTINCT league_id FROM picks WHERE tournament_id = $1',
        [tournament.id]
      );
      for (const l of leagues) {
        if (tournament.status === 'completed' || result.updated > 10) {
          await notifyLeagueMembers(l.league_id, 'system', 'results', 'Results updated', `Live results for ${tournament.name} have been updated.`);
          await recalculateBadges(l.league_id);
        }
      }
      await logAction('auto_sync', `Synced ${result.updated} results for ${tournament.name}`);
    }

    const reconciled = await reconcilePickPayouts();

    return NextResponse.json({ tournament: tournament.name, ...result, reconciled });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
