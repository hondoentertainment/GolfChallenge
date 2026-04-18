import { NextRequest, NextResponse } from 'next/server';
import { syncTournamentResults } from '@/lib/pga-data';
import { getCurrentTournament, reconcilePickPayouts } from '@/lib/picks';
import { ensureSeeded } from '@/lib/seed';

// Runs Sunday 11pm UTC - auto-sync tournament results from ESPN
export async function GET(req: NextRequest) {
  // Verify cron secret in production
  if (process.env.CRON_SECRET && req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  await ensureSeeded();
  try {
    const tournament = await getCurrentTournament();
    if (!tournament) return NextResponse.json({ message: 'No active tournament' });

    const result = await syncTournamentResults(tournament.id);

    // Backfill any picks still missing payouts after the sync
    const reconciled = await reconcilePickPayouts();

    return NextResponse.json({ tournament: tournament.name, ...result, reconciled });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
