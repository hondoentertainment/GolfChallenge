import { NextResponse } from 'next/server';
import { getTournaments, getGolfers, getCurrentTournament } from '@/lib/picks';
import { getTournamentPayouts } from '@/lib/pga-schedule';
import { ensureSeeded } from '@/lib/seed';

export async function GET() {
  ensureSeeded();
  try {
    const tournaments = getTournaments();
    const golfers = getGolfers();
    const currentTournament = getCurrentTournament();

    // Include prize payouts for each tournament
    const tournamentsWithPayouts = tournaments.map(t => ({
      ...t,
      payouts: getTournamentPayouts(t.purse),
    }));

    return NextResponse.json({ tournaments: tournamentsWithPayouts, golfers, currentTournament });
  } catch {
    return NextResponse.json({ error: 'Failed to fetch tournaments' }, { status: 500 });
  }
}
