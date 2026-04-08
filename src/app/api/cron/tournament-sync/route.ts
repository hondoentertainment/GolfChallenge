import { NextRequest, NextResponse } from 'next/server';
import { syncTournamentResults } from '@/lib/pga-data';
import { getCurrentTournament, getTournaments } from '@/lib/picks';
import { recalculateBadges } from '@/lib/badges';
import { notifyLeagueMembers } from '@/lib/notifications';
import { logAction } from '@/lib/audit';
import { query } from '@/lib/db';
import { ensureSeeded } from '@/lib/seed';

// Runs every 2 hours during tournament weekends (Thu-Sun)
// Schedule: 0 */2 * * 4-0 (configured in vercel.json)
export async function GET(req: NextRequest) {
  if (process.env.CRON_SECRET && req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  await ensureSeeded();
  try {
    // Find currently active tournament
    const tournament = await getCurrentTournament();
    if (!tournament) return NextResponse.json({ message: 'No active tournament' });

    const today = new Date().toISOString().split('T')[0];
    const isActive = tournament.start_date <= today && tournament.end_date >= today;
    if (!isActive) return NextResponse.json({ message: 'Tournament not in progress' });

    const result = await syncTournamentResults(tournament.id);

    // If tournament just completed, notify and recalculate badges
    if (result.updated > 0) {
      const leagues = await query<{ league_id: string }>(
        'SELECT DISTINCT league_id FROM picks WHERE tournament_id = $1',
        [tournament.id]
      );
      for (const l of leagues) {
        // Only notify if tournament is completed
        if (tournament.status === 'completed' || result.updated > 10) {
          await notifyLeagueMembers(l.league_id, 'system', 'results', 'Results updated', `Live results for ${tournament.name} have been updated.`);
          await recalculateBadges(l.league_id);
        }
      }
      await logAction('auto_sync', `Synced ${result.updated} results for ${tournament.name}`);
    }

    return NextResponse.json({ tournament: tournament.name, ...result });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
