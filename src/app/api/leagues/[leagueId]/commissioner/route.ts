import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { getLeague, isLeagueMember } from '@/lib/leagues';
import { execute, queryOne } from '@/lib/db';
import { ensureSeeded } from '@/lib/seed';

export async function POST(req: NextRequest, { params }: { params: Promise<{ leagueId: string }> }) {
  await ensureSeeded();
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { leagueId } = await params;
    const league = await getLeague(leagueId);
    if (!league) return NextResponse.json({ error: 'League not found' }, { status: 404 });

    // Only the league creator (commissioner) or admin can use these tools
    if (league.created_by !== user.id && !user.is_admin) {
      return NextResponse.json({ error: 'Only the league commissioner can do this' }, { status: 403 });
    }

    const { action, targetUserId } = await req.json();

    switch (action) {
      case 'remove_member': {
        if (!targetUserId) return NextResponse.json({ error: 'targetUserId required' }, { status: 400 });
        if (targetUserId === league.created_by) return NextResponse.json({ error: 'Cannot remove the commissioner' }, { status: 400 });
        // Delete their picks and membership
        await execute('DELETE FROM picks WHERE league_id = $1 AND user_id = $2', [leagueId, targetUserId]);
        await execute('DELETE FROM league_members WHERE league_id = $1 AND user_id = $2', [leagueId, targetUserId]);
        return NextResponse.json({ message: 'Member removed' });
      }
      case 'transfer_commissioner': {
        if (!targetUserId) return NextResponse.json({ error: 'targetUserId required' }, { status: 400 });
        if (!(await isLeagueMember(leagueId, targetUserId))) {
          return NextResponse.json({ error: 'Target must be a league member' }, { status: 400 });
        }
        await execute('UPDATE leagues SET created_by = $1 WHERE id = $2', [targetUserId, leagueId]);
        return NextResponse.json({ message: 'Commissioner transferred' });
      }
      case 'rename_league': {
        const { name } = await req.json().catch(() => ({ name: undefined }));
        if (!name) return NextResponse.json({ error: 'name required' }, { status: 400 });
        await execute('UPDATE leagues SET name = $1 WHERE id = $2', [name, leagueId]);
        return NextResponse.json({ message: 'League renamed' });
      }
      case 'regenerate_invite': {
        const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
        let code = '';
        for (let i = 0; i < 6; i++) code += chars.charAt(Math.floor(Math.random() * chars.length));
        await execute('UPDATE leagues SET invite_code = $1 WHERE id = $2', [code, leagueId]);
        return NextResponse.json({ message: 'Invite code regenerated', invite_code: code });
      }
      default:
        return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
    }
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
