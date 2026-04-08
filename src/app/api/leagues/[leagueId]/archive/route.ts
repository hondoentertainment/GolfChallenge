import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { getLeague } from '@/lib/leagues';
import { archiveSeason, getArchivedSeasons } from '@/lib/seasons';
import { ensureSeeded } from '@/lib/seed';

export async function GET(req: NextRequest, { params }: { params: Promise<{ leagueId: string }> }) {
  await ensureSeeded();
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { leagueId } = await params;
    const archives = await getArchivedSeasons(leagueId);
    return NextResponse.json({ archives });
  } catch {
    return NextResponse.json({ error: 'Failed to fetch archives' }, { status: 500 });
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ leagueId: string }> }) {
  await ensureSeeded();
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { leagueId } = await params;
    const league = await getLeague(leagueId);
    if (!league) return NextResponse.json({ error: 'League not found' }, { status: 404 });
    if (league.created_by !== user.id && !user.is_admin) {
      return NextResponse.json({ error: 'Only the commissioner can archive the season' }, { status: 403 });
    }

    const archived = await archiveSeason(leagueId, league.season, user.id);
    return NextResponse.json({ archived });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Failed' }, { status: 400 });
  }
}
