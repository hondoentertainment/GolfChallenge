import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { createLeague, getUserLeagues, joinLeague } from '@/lib/leagues';
import { ensureSeeded } from '@/lib/seed';

export async function GET() {
  ensureSeeded();
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const leagues = getUserLeagues(user.id);
    return NextResponse.json({ leagues });
  } catch {
    return NextResponse.json({ error: 'Failed to fetch leagues' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  ensureSeeded();
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { name, inviteCode } = await req.json();

    // If inviteCode is provided, join existing league
    if (inviteCode) {
      const league = joinLeague(inviteCode, user.id);
      if (!league) {
        return NextResponse.json({ error: 'Invalid invite code' }, { status: 404 });
      }
      return NextResponse.json({ league });
    }

    // Otherwise create new league
    if (!name) {
      return NextResponse.json({ error: 'League name is required' }, { status: 400 });
    }

    const league = createLeague(name, user.id);
    return NextResponse.json({ league });
  } catch {
    return NextResponse.json({ error: 'Failed to create/join league' }, { status: 500 });
  }
}
