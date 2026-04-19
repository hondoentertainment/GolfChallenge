import { verifyCronAuth } from '@/lib/cron-auth';
import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { getTournaments, getLeagueStandings, getLeaguePicks } from '@/lib/picks';
import { sendWeeklyRecapEmail } from '@/lib/email';
import { ensureSeeded } from '@/lib/seed';

// Runs Monday 12pm UTC - send weekly recap of last week's results
export async function GET(req: NextRequest) {
  const authError = verifyCronAuth(req);
  if (authError) return authError;
  await ensureSeeded();
  try {
    const tournaments = await getTournaments();
    // Find the most recently completed tournament
    const today = new Date().toISOString().split('T')[0];
    const lastTournament = tournaments.filter(t => t.end_date < today).pop();
    if (!lastTournament) return NextResponse.json({ message: 'No completed tournament' });

    const leagues = await query<{ id: string; name: string }>(
      'SELECT id, name FROM leagues WHERE archived = FALSE'
    );
    let sent = 0;

    for (const league of leagues) {
      const picks = await getLeaguePicks(league.id, lastTournament.id);
      if (picks.length === 0) continue;

      const standings = await getLeagueStandings(league.id);
      const members = await query<{ user_id: string; email: string; username: string }>(
        `SELECT lm.user_id, u.email, u.username FROM league_members lm
         JOIN users u ON lm.user_id = u.id WHERE lm.league_id = $1`,
        [league.id]
      );

      const picksHtml = picks.map(p =>
        `<tr><td style="padding:4px 8px">${p.username}</td><td style="padding:4px 8px">${p.golfer_name}</td><td style="padding:4px 8px;text-align:right">${p.prize_money > 0 ? '$' + p.prize_money.toLocaleString() : 'MC'}</td></tr>`
      ).join('');

      const standingsHtml = standings.map((s, i) =>
        `<tr><td style="padding:4px 8px">${i + 1}</td><td style="padding:4px 8px">${s.username}</td><td style="padding:4px 8px;text-align:right">$${s.totalPrizeMoney.toLocaleString()}</td></tr>`
      ).join('');

      const recap = `
        <h3>${lastTournament.name} Results - ${league.name}</h3>
        <table style="border-collapse:collapse;width:100%"><tr style="background:#f0f4f0"><th style="padding:4px 8px;text-align:left">Player</th><th style="padding:4px 8px;text-align:left">Golfer</th><th style="padding:4px 8px;text-align:right">Prize</th></tr>${picksHtml}</table>
        <h3 style="margin-top:16px">Season Standings</h3>
        <table style="border-collapse:collapse;width:100%"><tr style="background:#f0f4f0"><th style="padding:4px 8px;text-align:left">#</th><th style="padding:4px 8px;text-align:left">Player</th><th style="padding:4px 8px;text-align:right">Total</th></tr>${standingsHtml}</table>
      `;

      for (const m of members) {
        await sendWeeklyRecapEmail(m.email, m.username, recap);
        sent++;
      }
    }

    return NextResponse.json({ tournament: lastTournament.name, sent });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
