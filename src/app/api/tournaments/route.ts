import { NextResponse } from 'next/server';
import { getTournaments, getGolfers, getCurrentTournament } from '@/lib/picks';
import { getTournamentPayouts } from '@/lib/pga-schedule';
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

    return NextResponse.json({ tournaments: tournamentsWithPayouts, golfers, currentTournament });
  } catch {
    return NextResponse.json({ error: 'Failed to fetch tournaments' }, { status: 500 });
  }
}
