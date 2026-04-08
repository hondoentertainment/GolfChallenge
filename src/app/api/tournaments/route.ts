import { NextResponse } from 'next/server';
import { getTournaments, getGolfers, getCurrentTournament } from '@/lib/picks';
import { ensureSeeded } from '@/lib/seed';

export async function GET() {
  ensureSeeded();
  try {
    const tournaments = getTournaments();
    const golfers = getGolfers();
    const currentTournament = getCurrentTournament();

    return NextResponse.json({ tournaments, golfers, currentTournament });
  } catch {
    return NextResponse.json({ error: 'Failed to fetch tournaments' }, { status: 500 });
  }
}
