import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { canAccessMetricsReview } from '@/lib/metrics-review-access';
import { ensureSeeded } from '@/lib/seed';
import { query } from '@/lib/db';
import { getTournaments, getLeaguePicks } from '@/lib/picks';
import { getLeagueMembers } from '@/lib/leagues';

type CiRunSummary = {
  conclusion: string | null;
  status: string;
  htmlUrl: string;
  headSha: string;
  updatedAt: string;
  workflowName: string;
};

async function fetchLatestCiRun(): Promise<CiRunSummary | null> {
  try {
    const res = await fetch(
      'https://api.github.com/repos/hondoentertainment/GolfChallenge/actions/workflows/ci.yml/runs?per_page=1&branch=main',
      {
        headers: {
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
          ...(process.env.GITHUB_TOKEN ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {}),
        },
        next: { revalidate: 120 },
      },
    );
    if (!res.ok) return null;
    const data = (await res.json()) as {
      workflow_runs?: Array<{
        conclusion?: string | null;
        status?: string;
        html_url?: string;
        head_sha?: string;
        updated_at?: string;
        name?: string;
      }>;
    };
    const run = data.workflow_runs?.[0];
    if (!run) return null;
    return {
      conclusion: run.conclusion ?? null,
      status: run.status ?? 'unknown',
      htmlUrl: run.html_url ?? '',
      headSha: run.head_sha ?? '',
      updatedAt: run.updated_at ?? '',
      workflowName: run.name ?? 'CI',
    };
  } catch {
    return null;
  }
}

export async function GET() {
  await ensureSeeded();
  const user = await getCurrentUser();
  if (!canAccessMetricsReview(user)) {
    return NextResponse.json({ error: 'Metrics review access required' }, { status: 403 });
  }

  try {
    const [ci, tournamentList, leaguesWithPicks, resultCounts] = await Promise.all([
      fetchLatestCiRun(),
      getTournaments('2025-2026'),
      query<{ id: string; name: string }>(
        `SELECT DISTINCT l.id, l.name
         FROM leagues l
         INNER JOIN picks p ON p.league_id = l.id
         WHERE (l.archived IS NULL OR l.archived = FALSE) AND l.season = '2025-2026'
         ORDER BY l.name ASC`,
      ),
      query<{ tournament_id: string; cnt: string }>(
        `SELECT tournament_id, COUNT(*)::text AS cnt
         FROM tournament_results tr
         JOIN tournaments t ON t.id = tr.tournament_id
         WHERE t.season = '2025-2026'
         GROUP BY tournament_id`,
      ),
    ]);

    const resultRowCount = new Map<string, number>();
    for (const r of resultCounts) {
      resultRowCount.set(r.tournament_id, Number(r.cnt));
    }

    const tournaments = tournamentList.map((t) => ({
      id: t.id,
      name: t.name,
      startDate: t.start_date,
      endDate: t.end_date,
      purse: t.purse ?? 0,
      status: t.status ?? null,
      resultRowCount: resultRowCount.get(t.id) ?? 0,
    }));

    const testsPassing =
      ci?.conclusion === 'success'
        ? true
        : ci?.conclusion === 'failure'
          ? false
          : null;

    const leagues = [];
    for (const lg of leaguesWithPicks) {
      const members = await getLeagueMembers(lg.id);
      const picks = await getLeaguePicks(lg.id);
      const pickMap = new Map<string, (typeof picks)[0]>();
      for (const p of picks) {
        pickMap.set(`${p.user_id}:${p.tournament_id}`, p);
      }

      const players = members.map((m) => {
        let seasonTotal = 0;
        const events = tournaments.map((t) => {
          const pk = pickMap.get(`${m.user_id}:${t.id}`);
          if (!pk) {
            return {
              tournamentId: t.id,
              pickedGolfer: null as string | null,
              missed: false,
              position: null as string | null,
              prizeMoney: 0,
              prizeSource: null as string | null,
              metricsConfirmed: false,
            };
          }
          seasonTotal += pk.prize_money ?? 0;
          const pos = pk.position;
          const metricsConfirmed =
            typeof pos === 'string' && pos.trim() !== '';
          return {
            tournamentId: t.id,
            pickedGolfer: pk.is_missed ? null : pk.golfer_name,
            missed: Boolean(pk.is_missed),
            position: pos,
            prizeMoney: pk.prize_money ?? 0,
            prizeSource: pk.prize_source ?? null,
            metricsConfirmed,
          };
        });

        return {
          userId: m.user_id,
          username: m.username,
          seasonTotal,
          events,
        };
      });

      leagues.push({
        id: lg.id,
        name: lg.name,
        tournaments,
        players,
      });
    }

    return NextResponse.json({
      ci: ci
        ? {
            ...ci,
            testsPassing,
            repo: 'hondoentertainment/GolfChallenge',
            workflowFile: 'ci.yml',
          }
        : null,
      leagues,
      season: '2025-2026',
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Failed to load metrics review' },
      { status: 500 },
    );
  }
}
