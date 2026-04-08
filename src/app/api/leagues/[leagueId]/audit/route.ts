import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { isLeagueMember } from '@/lib/leagues';
import { getLeagueAuditLog } from '@/lib/audit';
import { ensureSeeded } from '@/lib/seed';

export async function GET(req: NextRequest, { params }: { params: Promise<{ leagueId: string }> }) {
  await ensureSeeded();
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { leagueId } = await params;
    if (!(await isLeagueMember(leagueId, user.id))) {
      return NextResponse.json({ error: 'Not a member' }, { status: 403 });
    }

    const log = await getLeagueAuditLog(leagueId);
    return NextResponse.json({ log });
  } catch {
    return NextResponse.json({ error: 'Failed to fetch audit log' }, { status: 500 });
  }
}
