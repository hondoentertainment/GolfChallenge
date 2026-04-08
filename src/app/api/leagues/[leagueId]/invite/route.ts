import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { getLeague, isLeagueMember, joinLeague } from '@/lib/leagues';
import { ensureSeeded } from '@/lib/seed';

// GET: Get invite info (public - no auth needed for viewing)
export async function GET(req: NextRequest, { params }: { params: Promise<{ leagueId: string }> }) {
  await ensureSeeded();
  try {
    const { leagueId } = await params;
    const { searchParams } = new URL(req.url);
    const code = searchParams.get('code');

    if (!code) {
      // If authenticated member, return the invite link info
      const user = await getCurrentUser();
      if (!user) return NextResponse.json({ error: 'Code required' }, { status: 400 });
      if (!(await isLeagueMember(leagueId, user.id))) {
        return NextResponse.json({ error: 'Not a member' }, { status: 403 });
      }
      const league = await getLeague(leagueId);
      if (!league) return NextResponse.json({ error: 'Not found' }, { status: 404 });

      const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://golf-challenge.vercel.app';
      const inviteUrl = `${appUrl}/leagues/${leagueId}/invite?code=${league.invite_code}`;

      return NextResponse.json({ inviteUrl, inviteCode: league.invite_code, leagueName: league.name });
    }

    // Public: validate invite code and show league info
    const league = await getLeague(leagueId);
    if (!league || league.invite_code !== code) {
      return NextResponse.json({ error: 'Invalid invite link' }, { status: 404 });
    }

    return NextResponse.json({ leagueName: league.name, leagueId: league.id, inviteCode: code });
  } catch {
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}

// POST: Join via invite link
export async function POST(req: NextRequest, { params }: { params: Promise<{ leagueId: string }> }) {
  await ensureSeeded();
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: 'Please sign in first' }, { status: 401 });

    const { leagueId } = await params;
    const { code } = await req.json();

    const league = await getLeague(leagueId);
    if (!league || league.invite_code !== code) {
      return NextResponse.json({ error: 'Invalid invite' }, { status: 404 });
    }

    await joinLeague(code, user.id);
    return NextResponse.json({ success: true, leagueId });
  } catch {
    return NextResponse.json({ error: 'Failed to join' }, { status: 500 });
  }
}
