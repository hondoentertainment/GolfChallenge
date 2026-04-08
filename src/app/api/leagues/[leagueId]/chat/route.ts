import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { isLeagueMember } from '@/lib/leagues';
import { sendMessage, getMessages, getMessagesSince } from '@/lib/chat';
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

    const { searchParams } = new URL(req.url);
    const since = searchParams.get('since');

    const messages = since
      ? await getMessagesSince(leagueId, since)
      : await getMessages(leagueId);

    return NextResponse.json({ messages: since ? messages : messages.reverse() });
  } catch {
    return NextResponse.json({ error: 'Failed to fetch messages' }, { status: 500 });
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ leagueId: string }> }) {
  await ensureSeeded();
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { leagueId } = await params;
    if (!(await isLeagueMember(leagueId, user.id))) {
      return NextResponse.json({ error: 'Not a member' }, { status: 403 });
    }

    const { message } = await req.json();
    if (!message?.trim()) {
      return NextResponse.json({ error: 'Message required' }, { status: 400 });
    }

    const msg = await sendMessage(leagueId, user.id, message.trim().slice(0, 500));
    return NextResponse.json({ message: msg });
  } catch {
    return NextResponse.json({ error: 'Failed to send message' }, { status: 500 });
  }
}
