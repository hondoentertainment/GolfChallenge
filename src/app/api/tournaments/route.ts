import { NextResponse } from 'next/server';
import { getTournaments, getGolfers, getCurrentTournament } from '@/lib/picks';
import { getTournamentPayouts } from '@/lib/pga-schedule';
import { getFieldGolferIds } from '@/lib/golfer-field';
import { ensureSeeded } from '@/lib/seed';

export async function GET() {
  await ensureSeeded();
  try {
    const tournaments = await getTournaments();
    const golfers = await getGolfers();
    const currentTournament = await getCurrentTournament();

    const tournamentsWithPayouts = tournaments.map(t => ({
      ...t,
      payouts: getTournamentPayouts(t.purse),
    }));

    // Fetch field for current/upcoming tournament
    let fieldGolferIds: string[] = [];
    try {
      fieldGolferIds = await getFieldGolferIds();
    } catch { /* fallback to empty = show all */ }

    return NextResponse.json({
      tournaments: tournamentsWithPayouts,
      golfers,
      currentTournament,
      fieldGolferIds, // empty array means show all (no field data available)
    });
  } catch {
    return NextResponse.json({ error: 'Failed to fetch tournaments' }, { status: 500 });
  }
}
