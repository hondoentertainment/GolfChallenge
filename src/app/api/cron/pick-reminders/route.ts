import { verifyCronAuth } from '@/lib/cron-auth';
import { NextRequest, NextResponse } from 'next/server';
import { getCurrentTournament, getPickOrder, markMissedPicks, canUserPick } from '@/lib/picks';
import { query, queryOne } from '@/lib/db';
import { CHALLENGE_SEASON } from '@/lib/challenge-season';
import { sendPickReminderEmail } from '@/lib/email';
import { createNotification } from '@/lib/notifications';
import { ensureSeeded } from '@/lib/seed';

// Runs Wednesday 4pm UTC (9am PDT) - remind players who haven't picked yet
export async function GET(req: NextRequest) {
  const authError = verifyCronAuth(req);
  if (authError) return authError;
  await ensureSeeded();
  try {
    const tournament = await getCurrentTournament();
    if (!tournament) return NextResponse.json({ message: 'No upcoming tournament' });

    // Get all leagues
    const leagues = await query<{ id: string }>('SELECT id FROM leagues WHERE archived = FALSE');
    let reminded = 0;

    for (const league of leagues) {
      const order = await getPickOrder(league.id, tournament.id);
      for (const entry of order) {
        const { canPick } = await canUserPick(league.id, entry.userId, tournament.id);
        if (!canPick) continue;

        // Get user email
        const user = await queryOne<{ email: string; username: string }>(
          'SELECT email, username FROM users WHERE id = $1', [entry.userId]
        );
        if (!user) continue;

        const deadlineStr = entry.deadline.toLocaleString('en-US', {
          timeZone: 'America/Los_Angeles',
          weekday: 'long', hour: 'numeric', minute: '2-digit',
        }) + ' PDT';

        await sendPickReminderEmail(user.email, user.username, tournament.name, deadlineStr);
        await createNotification(entry.userId, 'reminder', 'Pick Reminder', `Don't forget to pick for ${tournament.name} by ${deadlineStr}`, league.id);
        reminded++;
      }
    }

    // Also mark any missed picks from previous tournaments
    const tournaments = await query<{ id: string }>('SELECT id FROM tournaments WHERE end_date < $1 AND season = $2', [new Date().toISOString().split('T')[0], CHALLENGE_SEASON]);
    let totalMissed = 0;
    for (const t of tournaments) {
      totalMissed += await markMissedPicks(t.id);
    }

    return NextResponse.json({ tournament: tournament.name, reminded, missedMarked: totalMissed });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
