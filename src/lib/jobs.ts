// Job registry — single source of truth for all runnable background jobs.
// Each cron route delegates to its job function here; the admin jobs page
// can invoke the same functions directly (with admin auth) without needing
// the CRON_SECRET.

import { execute, query, queryOne } from './db';
import {
  syncTournamentResults,
  finalizeRecentTournaments,
  populateAllCompletedTournaments,
} from './pga-data';
import {
  getCurrentTournament,
  getPickOrder,
  markMissedPicks,
  reconcilePickPayouts,
  getTournaments,
  getLeagueStandings,
  getLeaguePicks,
} from './picks';
import { sendPickReminderEmail, sendWeeklyRecapEmail } from './email';
import { createNotification } from './notifications';

export interface JobResult {
  ok: boolean;
  summary: string;
  data?: unknown;
}

export interface JobDefinition {
  name: string;
  label: string;
  description: string;
  schedule: string;
  run: () => Promise<JobResult>;
}

async function cleanupJob(): Promise<JobResult> {
  await execute('DELETE FROM password_resets WHERE expires_at < NOW() OR used = TRUE');
  await execute("DELETE FROM notifications WHERE created_at < NOW() - INTERVAL '90 days'");
  return { ok: true, summary: 'Cleanup complete — expired sessions + notifications >90 days removed' };
}

async function tournamentSyncJob(): Promise<JobResult> {
  const tournament = await getCurrentTournament();
  if (!tournament) return { ok: true, summary: 'No active tournament' };

  const today = new Date().toISOString().split('T')[0];
  const isActive = tournament.start_date <= today && tournament.end_date >= today;
  if (!isActive) return { ok: true, summary: `${tournament.name} not in progress` };

  const result = await syncTournamentResults(tournament.id);
  const reconciled = await reconcilePickPayouts();
  return {
    ok: true,
    summary: `${tournament.name}: synced ${result.updated} results (${result.espnHadEvent ? 'ESPN live' : 'ESPN empty'}), reconciled ${reconciled.created + reconciled.updated} picks`,
    data: { ...result, reconciled },
  };
}

async function syncResultsJob(): Promise<JobResult> {
  const tournament = await getCurrentTournament();
  if (!tournament) return { ok: true, summary: 'No active tournament' };

  const result = await syncTournamentResults(tournament.id);
  const reconciled = await reconcilePickPayouts();
  return {
    ok: true,
    summary: `${tournament.name}: ${result.updated} synced, ${reconciled.created + reconciled.updated} reconciled`,
    data: { tournament: tournament.name, ...result, reconciled },
  };
}

async function finalizePayoutsJob(): Promise<JobResult> {
  const result = await finalizeRecentTournaments();
  if (result.finalized.length === 0) {
    return { ok: true, summary: 'No recent tournaments needed finalization' };
  }
  const summary = result.finalized
    .map(f => `${f.tournamentName}: ${f.synced} synced, ${f.reconciled.created + f.reconciled.updated} reconciled`)
    .join('; ');
  return { ok: true, summary, data: result };
}

async function pickRemindersJob(): Promise<JobResult> {
  const tournament = await getCurrentTournament();
  if (!tournament) return { ok: true, summary: 'No upcoming tournament' };

  const leagues = await query<{ id: string }>('SELECT id FROM leagues WHERE archived = FALSE');
  let reminded = 0;

  for (const league of leagues) {
    const order = await getPickOrder(league.id, tournament.id);
    for (const entry of order) {
      const pick = await queryOne(
        'SELECT id FROM picks WHERE league_id = $1 AND user_id = $2 AND tournament_id = $3',
        [league.id, entry.userId, tournament.id]
      );
      if (pick) continue;

      const user = await queryOne<{ email: string; username: string }>(
        'SELECT email, username FROM users WHERE id = $1', [entry.userId]
      );
      if (!user) continue;

      const deadlineStr = entry.deadline.toLocaleString('en-US', {
        timeZone: 'America/Los_Angeles',
        weekday: 'long', hour: 'numeric', minute: '2-digit',
      }) + ' PDT';

      await sendPickReminderEmail(user.email, user.username, tournament.name, deadlineStr);
      await createNotification(entry.userId, 'reminder', 'Pick Reminder',
        `Don't forget to pick for ${tournament.name} by ${deadlineStr}`, league.id);
      reminded++;
    }
  }

  const past = await query<{ id: string }>(
    'SELECT id FROM tournaments WHERE end_date < $1 AND season = $2',
    [new Date().toISOString().split('T')[0], '2025-2026']
  );
  let totalMissed = 0;
  for (const t of past) totalMissed += await markMissedPicks(t.id);

  return {
    ok: true,
    summary: `${tournament.name}: ${reminded} reminded, ${totalMissed} missed-pick entries recorded`,
    data: { tournament: tournament.name, reminded, missedMarked: totalMissed },
  };
}

async function weeklyRecapJob(): Promise<JobResult> {
  const tournaments = await getTournaments();
  const today = new Date().toISOString().split('T')[0];
  const lastTournament = tournaments.filter(t => t.end_date < today).pop();
  if (!lastTournament) return { ok: true, summary: 'No completed tournament' };

  const leagues = await query<{ id: string; name: string }>(
    'SELECT id, name FROM leagues WHERE archived = FALSE'
  );
  let sent = 0;

  for (const league of leagues) {
    const picks = await getLeaguePicks(league.id, lastTournament.id);
    if (picks.length === 0) continue;

    const standings = await getLeagueStandings(league.id);
    const members = await query<{ email: string; username: string }>(
      `SELECT u.email, u.username FROM league_members lm
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

  return {
    ok: true,
    summary: `${lastTournament.name}: sent ${sent} recap emails`,
    data: { tournament: lastTournament.name, sent },
  };
}

async function populateAllJob(): Promise<JobResult> {
  const result = await populateAllCompletedTournaments();
  const reconciled = await reconcilePickPayouts();
  return {
    ok: true,
    summary: `Populated ${result.totalPopulated} rows across ${result.tournaments.length} tournaments; reconciled ${reconciled.created + reconciled.updated} picks`,
    data: { ...result, reconciled },
  };
}

async function reconcileJob(): Promise<JobResult> {
  const result = await reconcilePickPayouts();
  return {
    ok: true,
    summary: `Reconciled ${result.created} created, ${result.updated} updated, ${result.historicalFetched} from ESPN historical`,
    data: result,
  };
}

export const JOBS: Record<string, JobDefinition> = {
  cleanup: {
    name: 'cleanup',
    label: 'Cleanup',
    description: 'Delete expired password resets and notifications older than 90 days',
    schedule: 'Sunday 3am UTC',
    run: cleanupJob,
  },
  'tournament-sync': {
    name: 'tournament-sync',
    label: 'Tournament Sync (live)',
    description: 'Sync ESPN live scoreboard for the current in-progress tournament + reconcile picks',
    schedule: 'Every 2h Thu-Sun',
    run: tournamentSyncJob,
  },
  'sync-results': {
    name: 'sync-results',
    label: 'Sync Results (weekly)',
    description: 'Weekly ESPN sync for the current/most-recent tournament + reconcile picks',
    schedule: 'Sunday 11pm UTC',
    run: syncResultsJob,
  },
  'finalize-payouts': {
    name: 'finalize-payouts',
    label: 'Finalize Payouts',
    description: 'Find tournaments that ended in the last 14 days and fully finalize them (sync → historical fallback → reconcile → notify)',
    schedule: 'Monday 6am UTC',
    run: finalizePayoutsJob,
  },
  'pick-reminders': {
    name: 'pick-reminders',
    label: 'Pick Reminders',
    description: 'Email + push notify players who haven\'t picked yet for the upcoming tournament',
    schedule: 'Wednesday 4pm UTC',
    run: pickRemindersJob,
  },
  'weekly-recap': {
    name: 'weekly-recap',
    label: 'Weekly Recap',
    description: 'Email every league member a recap of last week\'s results + standings',
    schedule: 'Monday 12pm UTC',
    run: weeklyRecapJob,
  },
  'populate-all': {
    name: 'populate-all',
    label: 'Populate All Completed',
    description: 'ESPN historical fetch for every completed tournament — fills any gaps not in audit-approved seeds',
    schedule: 'On-demand',
    run: populateAllJob,
  },
  reconcile: {
    name: 'reconcile',
    label: 'Reconcile Picks',
    description: 'Backfill missing payouts for every pick (including ESPN historical fallback for empty tournaments)',
    schedule: 'On every page view (throttled) + on-demand',
    run: reconcileJob,
  },
};

export function listJobs(): Omit<JobDefinition, 'run'>[] {
  return Object.values(JOBS).map(({ run: _run, ...rest }) => rest);
}

export async function runJob(name: string): Promise<JobResult & { durationMs: number }> {
  const job = JOBS[name];
  if (!job) return { ok: false, summary: `Unknown job: ${name}`, durationMs: 0 };

  const start = Date.now();
  try {
    const result = await job.run();
    return { ...result, durationMs: Date.now() - start };
  } catch (e) {
    return {
      ok: false,
      summary: `Job failed: ${e instanceof Error ? e.message : String(e)}`,
      durationMs: Date.now() - start,
    };
  }
}
