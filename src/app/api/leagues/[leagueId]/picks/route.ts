import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { isLeagueMember } from '@/lib/leagues';
import { canUserPick, makePick, getLeaguePicks, getPickOrder, getUserUsedGolfers } from '@/lib/picks';
import { ensureSeeded } from '@/lib/seed';

export async function GET(req: NextRequest, { params }: { params: Promise<{ leagueId: string }> }) {
  ensureSeeded();
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { leagueId } = await params;

    if (!isLeagueMember(leagueId, user.id)) {
      return NextResponse.json({ error: 'Not a member of this league' }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const tournamentId = searchParams.get('tournamentId') || undefined;

    const picks = getLeaguePicks(leagueId, tournamentId);

    // If tournamentId provided, also return pick order and availability
    let pickOrder = null;
    let userCanPick = null;
    if (tournamentId) {
      pickOrder = getPickOrder(leagueId, tournamentId);
      userCanPick = canUserPick(leagueId, user.id, tournamentId);
    }

    const usedGolfers = getUserUsedGolfers(leagueId, user.id);
    return NextResponse.json({ picks, pickOrder, userCanPick, usedGolfers });
  } catch {
    return NextResponse.json({ error: 'Failed to fetch picks' }, { status: 500 });
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ leagueId: string }> }) {
  ensureSeeded();
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { leagueId } = await params;

    if (!isLeagueMember(leagueId, user.id)) {
      return NextResponse.json({ error: 'Not a member of this league' }, { status: 403 });
    }

    const { tournamentId, golferId } = await req.json();

    if (!tournamentId || !golferId) {
      return NextResponse.json({ error: 'Tournament and golfer are required' }, { status: 400 });
    }

    const availability = canUserPick(leagueId, user.id, tournamentId);
    if (!availability.canPick) {
      return NextResponse.json({ error: availability.reason }, { status: 400 });
    }

    const pick = makePick(leagueId, user.id, tournamentId, golferId);
    return NextResponse.json({ pick });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to make pick';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
