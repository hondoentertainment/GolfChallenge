import { query, queryOne, execute } from './db';
import { CHALLENGE_SEASON, CHALLENGE_TOURNAMENTS_START_ON_OR_AFTER } from './challenge-season';
import { PGA_SCHEDULE_2025_2026, parsePosition, calculatePrizeMoney } from './pga-schedule';
import { syncTournamentResults, populateHistoricalTournament } from './pga-data';
import {
  getTournament,
  reconcilePickPayouts,
  recalculateTournamentResultPayoutsFromPurse,
} from './picks';
import {
  applyPublishedPayoutComplianceForTournament,
  auditPublishedPayoutComplianceForTournament,
  hasPublishedPayoutTable,
} from './published-payout-compliance';
import { recalculateBadges } from './badges';

export const EVENT_PIPELINE_STAGES = [
  {
    id: 'schedule',
    label: 'Schedule & purse',
    description: 'Tournament row matches in-repo dates, venue, and purse (PGA_SCHEDULE_2025_2026).',
  },
  {
    id: 'leaderboard',
    label: 'Leaderboard',
    description: 'ESPN live or historical field; every picked golfer has a result row.',
  },
  {
    id: 'reconcile',
    label: 'Reconcile picks',
    description: 'Global reconcile: historical fetch for gaps, backfill orphan result rows, then per-event tie-table recalc (same as automated pipelines).',
  },
  {
    id: 'tie_media',
    label: 'Tie table & media',
    description: 'Re-apply purse tie splits for this event, overlay transcribed media payouts if configured, refresh badges.',
  },
  {
    id: 'signoff',
    label: 'Sign-off',
    description: 'All gates green: no orphan picks, tie dollars consistent, published table audit when applicable.',
  },
] as const;

export type EventPipelineStageId = (typeof EVENT_PIPELINE_STAGES)[number]['id'];

type PipelineEventPhase = 'upcoming' | 'live' | 'complete';

function todayStr(): string {
  return new Date().toISOString().split('T')[0];
}

function eventPhase(t: { start_date: string; end_date: string }): PipelineEventPhase {
  const d = todayStr();
  if (t.end_date < d) return 'complete';
  if (t.start_date <= d && t.end_date >= d) return 'live';
  return 'upcoming';
}

function scheduleGate(t: { name: string; purse: number; start_date: string; end_date: string }): {
  ok: boolean;
  detail: string;
} {
  const s = PGA_SCHEDULE_2025_2026.find((x) => x.name === t.name);
  if (!s) {
    return { ok: false, detail: 'Tournament name not found in PGA_SCHEDULE_2025_2026' };
  }
  if (t.purse !== s.purse) {
    return { ok: false, detail: `Purse DB ${t.purse} ≠ schedule ${s.purse}` };
  }
  if (t.start_date !== s.startDate) {
    return { ok: false, detail: `Start date DB ${t.start_date} ≠ schedule ${s.startDate}` };
  }
  if (t.end_date !== s.endDate) {
    return { ok: false, detail: `End date DB ${t.end_date} ≠ schedule ${s.endDate}` };
  }
  return { ok: true, detail: 'Aligned with code schedule' };
}

async function getCoverageSlice(tournamentId: string): Promise<{
  resultRows: number;
  pickedWithResult: number;
  pickedWithoutResult: number;
}> {
  const row = await queryOne<{
    result_rows: string;
    picked_with_result: string;
    picked_without_result: string;
  }>(
    `
    SELECT
      (SELECT COUNT(*) FROM tournament_results tr WHERE tr.tournament_id = t.id) as result_rows,
      (SELECT COUNT(DISTINCT p.golfer_id) FROM picks p
       JOIN tournament_results tr ON tr.tournament_id = p.tournament_id AND tr.golfer_id = p.golfer_id
       WHERE p.tournament_id = t.id) as picked_with_result,
      (SELECT COUNT(DISTINCT p.golfer_id) FROM picks p
       LEFT JOIN tournament_results tr ON tr.tournament_id = p.tournament_id AND tr.golfer_id = p.golfer_id
       WHERE p.tournament_id = t.id AND tr.id IS NULL AND p.is_missed = FALSE) as picked_without_result
    FROM tournaments t
    WHERE t.id = $1
  `,
    [tournamentId],
  );
  if (!row) {
    return { resultRows: 0, pickedWithResult: 0, pickedWithoutResult: 0 };
  }
  return {
    resultRows: Number(row.result_rows),
    pickedWithResult: Number(row.picked_with_result),
    pickedWithoutResult: Number(row.picked_without_result),
  };
}

async function countOrphanPicksForTournament(tournamentId: string): Promise<number> {
  const row = await queryOne<{ c: string }>(
    `
    SELECT COUNT(*)::text as c
    FROM picks p
    JOIN tournaments t ON t.id = p.tournament_id
    LEFT JOIN tournament_results tr ON tr.tournament_id = p.tournament_id AND tr.golfer_id = p.golfer_id
    WHERE p.tournament_id = $1
      AND t.season = $2
      AND (t.start_date::date) >= $3::date
      AND (t.end_date::date) < CURRENT_DATE
      AND p.is_missed = FALSE
      AND (
        tr.id IS NULL
        OR (
          tr.prize_money = 0
          AND tr.position IS NOT NULL
          AND tr.position NOT IN ('MC','CUT','WD','DQ','DNS','MDF','')
        )
      )
  `,
    [tournamentId, CHALLENGE_SEASON, CHALLENGE_TOURNAMENTS_START_ON_OR_AFTER],
  );
  return row ? Number(row.c) : 0;
}

async function tieMoneyGate(tournamentId: string, tournamentName: string, purse: number): Promise<{
  ok: boolean;
  detail: string;
}> {
  const rows = await query<{ position: string; prize_money: number }>(
    'SELECT position, prize_money::int as prize_money FROM tournament_results WHERE tournament_id = $1',
    [tournamentId],
  );
  let bad = 0;
  for (const r of rows) {
    const pos = parsePosition(r.position);
    if (pos <= 0) continue;
    const expected = calculatePrizeMoney(purse, pos, tournamentName);
    if (expected > 0 && r.prize_money === 0) bad++;
  }
  if (bad > 0) {
    return { ok: false, detail: `${bad} paying position(s) still show $0 prize` };
  }
  return { ok: true, detail: 'Paying positions have non-zero purse dollars' };
}

export type DominoStageStatus = 'locked' | 'blocked' | 'ready' | 'complete' | 'skipped';

export type EventPipelineStageState = {
  id: EventPipelineStageId;
  label: string;
  description: string;
  status: DominoStageStatus;
  detail: string;
  runnable: boolean;
};

export async function getEventPipelineState(tournamentId: string): Promise<{
  tournament: { id: string; name: string; start_date: string; end_date: string; purse: number };
  phase: PipelineEventPhase;
  stages: EventPipelineStageState[];
  firstBlockedId: EventPipelineStageId | null;
}> {
  const t = await getTournament(tournamentId);
  if (!t) {
    throw new Error('Tournament not found');
  }

  const phase = eventPhase(t);
  const cov = await getCoverageSlice(tournamentId);
  const sched = scheduleGate(t);
  const orphanCount =
    phase === 'complete' ? await countOrphanPicksForTournament(tournamentId) : null;
  const tie = phase === 'complete' ? await tieMoneyGate(tournamentId, t.name, t.purse) : null;
  const publishedAudit =
    phase === 'complete' ? await auditPublishedPayoutComplianceForTournament(tournamentId) : null;

  const leaderboardOk =
    cov.resultRows > 0 &&
    cov.pickedWithoutResult === 0 &&
    (cov.pickedWithResult > 0 || cov.resultRows >= 12);
  const reconcileOk = phase !== 'complete' ? false : orphanCount === 0;
  const tieMediaOk =
    phase === 'complete' && reconcileOk && tie !== null
      ? tie.ok
      : false;
  const publishedOk =
    publishedAudit == null
      ? true
      : !publishedAudit.applicable || publishedAudit.ok;
  const signoffOk =
    phase === 'complete' &&
    sched.ok &&
    leaderboardOk &&
    reconcileOk &&
    (tie?.ok ?? false) &&
    publishedOk;

  const stages: EventPipelineStageState[] = [];

  const lockAfterLeaderboard = phase === 'upcoming';
  const lockReconcileOn = phase !== 'complete';

  // 1 schedule
  stages.push({
    id: 'schedule',
    label: EVENT_PIPELINE_STAGES[0].label,
    description: EVENT_PIPELINE_STAGES[0].description,
    status: sched.ok ? 'complete' : 'ready',
    detail: sched.detail,
    runnable: true,
  });

  // 2 leaderboard
  let lbStatus: DominoStageStatus;
  if (lockAfterLeaderboard) {
    lbStatus = 'locked';
  } else if (!sched.ok) {
    lbStatus = 'blocked';
  } else if (leaderboardOk) {
    lbStatus = 'complete';
  } else {
    lbStatus = 'ready';
  }
  stages.push({
    id: 'leaderboard',
    label: EVENT_PIPELINE_STAGES[1].label,
    description: EVENT_PIPELINE_STAGES[1].description,
    status: lbStatus,
    detail: leaderboardOk
      ? `${cov.resultRows} results; all picked golfers linked`
      : cov.pickedWithoutResult > 0
        ? `${cov.pickedWithoutResult} picked golfer(s) missing results`
        : cov.resultRows === 0
          ? 'No tournament_results yet'
          : 'Awaiting full field / picks coverage',
    runnable: lbStatus !== 'locked' && lbStatus !== 'blocked',
  });

  // 3 reconcile
  let recStatus: DominoStageStatus;
  if (lockReconcileOn) {
    recStatus = 'locked';
  } else if (!leaderboardOk || !sched.ok) {
    recStatus = 'blocked';
  } else if (reconcileOk) {
    recStatus = 'complete';
  } else {
    recStatus = 'ready';
  }
  stages.push({
    id: 'reconcile',
    label: EVENT_PIPELINE_STAGES[2].label,
    description: EVENT_PIPELINE_STAGES[2].description,
    status: recStatus,
    detail:
      orphanCount === null
        ? 'Runs after the event ends'
        : reconcileOk
          ? 'No orphan picks / dead prize rows for this event'
          : `${orphanCount} pick(s) still need reconciliation backfill`,
    runnable: recStatus !== 'locked' && recStatus !== 'blocked',
  });

  // 4 tie_media
  let tmStatus: DominoStageStatus;
  if (lockReconcileOn) {
    tmStatus = 'locked';
  } else if (!reconcileOk || !leaderboardOk || !sched.ok) {
    tmStatus = 'blocked';
  } else if (tieMediaOk) {
    tmStatus = 'complete';
  } else {
    tmStatus = 'ready';
  }
  const mediaNote = hasPublishedPayoutTable(t.name)
    ? ' + transcribed media overlay'
    : ' (no media table for this event)';
  stages.push({
    id: 'tie_media',
    label: EVENT_PIPELINE_STAGES[3].label,
    description: EVENT_PIPELINE_STAGES[3].description,
    status: tmStatus,
    detail: tie?.detail ? tie.detail + mediaNote : 'Awaiting earlier stages',
    runnable: tmStatus !== 'locked' && tmStatus !== 'blocked',
  });

  // 5 signoff
  const pubDetail =
    publishedAudit?.applicable && !publishedAudit.ok
      ? `Published audit: ${publishedAudit.mismatches.length} mismatch(es), ${publishedAudit.missingInDb.length} missing`
      : publishedAudit?.applicable
        ? 'Published payout table matches DB'
        : 'No transcribed media payout list';
  const signoffStatus: DominoStageStatus =
    lockReconcileOn ? 'locked' : !tieMediaOk || !reconcileOk || !leaderboardOk || !sched.ok ? 'blocked' : signoffOk ? 'complete' : 'blocked';
  stages.push({
    id: 'signoff',
    label: EVENT_PIPELINE_STAGES[4].label,
    description: EVENT_PIPELINE_STAGES[4].description,
    status: signoffStatus,
    detail: signoffOk ? `All clear — ${pubDetail}` : `Not ready — ${pubDetail}`,
    runnable: false,
  });

  const firstBlocked = stages.find((s) => s.status === 'blocked' || s.status === 'ready');
  return {
    tournament: {
      id: t.id,
      name: t.name,
      start_date: t.start_date,
      end_date: t.end_date,
      purse: t.purse,
    },
    phase,
    stages,
    firstBlockedId: firstBlocked ? firstBlocked.id : null,
  };
}

export async function syncOneTournamentFromScheduleRow(tournamentId: string): Promise<{
  ok: boolean;
  summary: string;
}> {
  const t = await getTournament(tournamentId);
  if (!t) return { ok: false, summary: 'Tournament not found' };
  const s = PGA_SCHEDULE_2025_2026.find((x) => x.name === t.name);
  if (!s) return { ok: false, summary: `No schedule entry for "${t.name}"` };

  await execute(
    `UPDATE tournaments
     SET purse = $1, start_date = $2, end_date = $3, course = $4, location = $5
     WHERE id = $6`,
    [s.purse, s.startDate, s.endDate, s.course, s.location, tournamentId],
  );
  return { ok: true, summary: `Updated purse, dates, course, location from code schedule` };
}

/**
 * Run one pipeline stage. Earlier stages must be complete unless re-running schedule on a failing row.
 * Server enforces ordering.
 */
export async function runEventPipelineStage(
  tournamentId: string,
  stageId: EventPipelineStageId,
): Promise<{ ok: boolean; summary: string; data?: unknown }> {
  const state = await getEventPipelineState(tournamentId);
  const idx = EVENT_PIPELINE_STAGES.findIndex((s) => s.id === stageId);
  if (idx < 0) return { ok: false, summary: 'Unknown stage' };
  if (stageId === 'signoff') return { ok: false, summary: 'Sign-off is computed automatically' };

  const target = state.stages[idx];
  if (target.status === 'locked') {
    return { ok: false, summary: 'Stage locked for this event phase (upcoming or still in progress).' };
  }
  if (target.status === 'blocked') {
    return { ok: false, summary: 'Complete the previous domino stage first.' };
  }

  if (stageId === 'schedule') {
    return syncOneTournamentFromScheduleRow(tournamentId);
  }

  if (stageId === 'leaderboard') {
    const syncResult = await syncTournamentResults(tournamentId);
    let histPop = 0;
    let histErr: string[] = [];
    if (!syncResult.espnHadEvent || syncResult.updated === 0) {
      const h = await populateHistoricalTournament(tournamentId, { force: false });
      histPop = h.populated;
      histErr = h.errors ?? [];
    }
    return {
      ok: true,
      summary: `ESPN sync: ${syncResult.updated} rows (${syncResult.espnHadEvent ? 'live board' : 'empty'}); historical +${histPop}. ${histErr.length ? histErr.join('; ') : ''}`,
      data: { syncResult, histPop, histErr },
    };
  }

  if (stageId === 'reconcile') {
    const r = await reconcilePickPayouts();
    return {
      ok: true,
      summary: `Reconcile: +${r.created} rows, ~${r.updated} updates, historical fetch ${r.historicalFetched}`,
      data: r,
    };
  }

  if (stageId === 'tie_media') {
    const t = await getTournament(tournamentId);
    if (!t) return { ok: false, summary: 'Tournament not found' };
    const rec = await recalculateTournamentResultPayoutsFromPurse(tournamentId);
    let media = { updated: 0, skippedNoRow: [] as { tournament: string; golfer: string; published: number }[] };
    if (hasPublishedPayoutTable(t.name)) {
      media = await applyPublishedPayoutComplianceForTournament(tournamentId, t.name);
    }
    const leagues = await query<{ league_id: string }>(
      'SELECT DISTINCT league_id FROM picks WHERE tournament_id = $1',
      [tournamentId],
    );
    for (const l of leagues) {
      await recalculateBadges(l.league_id);
    }
    return {
      ok: true,
      summary: `Tie table: ${rec.updated} result rows touched; media overlay ${media.updated} golfer(s); badges refreshed for ${leagues.length} league(s)`,
      data: { rec, media, leagues: leagues.length },
    };
  }

  return { ok: false, summary: 'Unhandled stage' };
}
