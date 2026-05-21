"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

interface CiPayload {
  conclusion: string | null;
  status: string;
  htmlUrl: string;
  headSha: string;
  updatedAt: string;
  workflowName: string;
  testsPassing: boolean | null;
  repo: string;
  workflowFile: string;
}

interface TournamentCol {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  purse: number;
  status: string | null;
  resultRowCount: number;
}

interface PlayerRow {
  userId: string;
  username: string;
  seasonTotal: number;
  events: Array<{
    tournamentId: string;
    pickedGolfer: string | null;
    missed: boolean;
    position: string | null;
    prizeMoney: number;
    prizeSource: string | null;
    metricsConfirmed: boolean;
  }>;
}

interface LeaguePayload {
  id: string;
  name: string;
  tournaments: TournamentCol[];
  players: PlayerRow[];
}

function formatMoney(n: number) {
  return n > 0 ? `$${n.toLocaleString()}` : "—";
}

/** Short label for `tournament_results.prize_source` in admin metrics cells. */
function prizeSourceBadge(source: string | null) {
  if (!source) return null;
  const map: Record<string, string> = {
    published_media: "Media",
    tie_table: "Table",
    manual: "Manual",
    seed: "Seed",
  };
  const label = map[source] ?? source.replace(/_/g, " ");
  return (
    <span
      className="inline-block mt-0.5 px-1.5 py-0 rounded bg-surface-alt border border-border text-[10px] uppercase tracking-wide text-muted"
      title={source}
    >
      {label}
    </span>
  );
}

export default function AdminMetricsReviewPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [ci, setCi] = useState<CiPayload | null>(null);
  const [leagues, setLeagues] = useState<LeaguePayload[]>([]);
  const [season, setSeason] = useState("");
  const [leagueIdx, setLeagueIdx] = useState(0);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((data) => {
        if (!data.user) {
          router.push("/login");
          return null;
        }
        if (!data.user.metrics_review_access) {
          router.push("/dashboard");
          return null;
        }
        return fetch("/api/admin/metrics-review");
      })
      .then((r) => {
        if (!r) return null;
        if (r.status === 403) {
          router.push("/dashboard");
          return null;
        }
        return r.json();
      })
      .then((data) => {
        if (!data) return;
        if (data.error) {
          setError(data.error);
          return;
        }
        setCi(data.ci ?? null);
        setLeagues(data.leagues ?? []);
        setSeason(data.season ?? "");
      })
      .catch(() => setError("Failed to load"))
      .finally(() => setLoading(false));
  }, [router]);

  const league = leagues[leagueIdx] ?? null;

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center min-h-screen">
        <div className="text-muted">Loading…</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <nav className="bg-primary text-white px-6 py-4">
        <div className="max-w-[1400px] mx-auto flex items-center gap-4 flex-wrap">
          <Link href="/dashboard" className="text-xl font-bold flex items-center gap-2">
            <span>&#9971;</span> Golf Challenge
          </Link>
          <span className="text-green-200">/</span>
          <span className="font-medium">Metrics review</span>
          <div className="ml-auto flex gap-3 text-sm">
            <Link href="/admin/results" className="text-green-200 hover:text-white">
              Results
            </Link>
            <Link href="/admin/event-pipeline" className="text-green-200 hover:text-white">
              Pipeline
            </Link>
            <Link href="/admin/jobs" className="text-green-200 hover:text-white">
              Jobs
            </Link>
          </div>
        </div>
      </nav>

      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 py-8">
        <h1 className="text-2xl font-bold mb-2">Test &amp; player metrics</h1>
        <p className="text-sm text-muted mb-6">
          CI status from GitHub Actions on <code className="text-xs bg-surface px-1 rounded">main</code>. Event columns show each member&apos;s
          pick, official finish, prize attributed from <code className="text-xs bg-surface px-1 rounded">tournament_results</code>, and whether a
          position is present (confirmed metrics). Season: {season || "—"}.
        </p>

        {error && <p className="text-danger font-medium mb-4">{error}</p>}

        <div className="bg-surface rounded-xl border border-border p-6 mb-8">
          <h2 className="font-semibold mb-3">Automated tests (GitHub CI)</h2>
          {ci ? (
            <div className="space-y-2 text-sm">
              <p>
                <span className="font-medium">Latest run:</span>{" "}
                <a href={ci.htmlUrl} target="_blank" rel="noreferrer" className="text-accent underline">
                  {ci.workflowName} · {ci.status}
                </a>
              </p>
              <p>
                <span className="font-medium">Conclusion:</span>{" "}
                {ci.testsPassing === true ? (
                  <span className="text-success font-medium">tests passing (success)</span>
                ) : ci.testsPassing === false ? (
                  <span className="text-danger font-medium">failing — open run for logs</span>
                ) : (
                  <span className="text-muted">pending or inconclusive ({ci.conclusion ?? "unknown"})</span>
                )}
              </p>
              <p className="text-muted text-xs break-all">SHA {ci.headSha} · updated {ci.updatedAt}</p>
              <p className="text-muted text-xs">
                Badge:{" "}
                <a
                  href="https://github.com/hondoentertainment/GolfChallenge/actions/workflows/ci.yml"
                  target="_blank"
                  rel="noreferrer"
                  className="underline"
                >
                  github.com/hondoentertainment/GolfChallenge/actions
                </a>
              </p>
            </div>
          ) : (
            <p className="text-muted text-sm">Could not load CI status from GitHub (rate limit or network). Try again later.</p>
          )}
        </div>

        {leagues.length === 0 && !error ? (
          <p className="text-muted">No leagues with picks in this season.</p>
        ) : (
          <>
            <div className="flex flex-wrap gap-2 mb-4 items-center">
              <span className="text-sm font-medium">League:</span>
              {leagues.map((lg, i) => (
                <button
                  key={lg.id}
                  type="button"
                  onClick={() => setLeagueIdx(i)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium border ${
                    i === leagueIdx
                      ? "bg-primary text-white border-primary"
                      : "bg-surface-alt border-border hover:border-primary"
                  }`}
                >
                  {lg.name}
                </button>
              ))}
            </div>

            {league && (
              <div className="overflow-x-auto rounded-xl border border-border bg-surface">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-surface-alt">
                      <th className="text-left p-3 sticky left-0 bg-surface-alt z-10 min-w-[120px] font-semibold">
                        Player
                      </th>
                      <th className="text-right p-3 font-semibold whitespace-nowrap sticky left-[120px] bg-surface-alt z-10 border-r border-border">
                        Season
                      </th>
                      {league.tournaments.map((t) => (
                        <th key={t.id} className="text-left p-3 min-w-[140px] align-bottom font-semibold">
                          <div className="font-semibold leading-tight">{t.name}</div>
                          <div className="text-xs font-normal text-muted mt-1">
                            {t.endDate} · {t.resultRowCount} rows · {(t.purse / 1e6).toFixed(1)}M
                          </div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {league.players.map((p) => (
                      <tr key={p.userId} className="border-b border-border/80 hover:bg-surface-alt/50">
                        <td className="p-3 sticky left-0 bg-surface font-medium z-[5]">{p.username}</td>
                        <td className="p-3 text-right whitespace-nowrap sticky left-[120px] bg-surface z-[5] border-r border-border font-mono text-xs">
                          {formatMoney(p.seasonTotal).replace("—", "$0")}
                        </td>
                        {p.events.map((ev) => (
                          <td key={ev.tournamentId} className="p-3 align-top text-xs">
                            {ev.missed ? (
                              <span className="text-muted">Missed pick</span>
                            ) : !ev.pickedGolfer ? (
                              <span className="text-muted">—</span>
                            ) : (
                              <>
                                <div className="font-medium text-foreground">{ev.pickedGolfer}</div>
                                <div className="text-muted">
                                  Finish: {ev.position ?? "—"}
                                </div>
                                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                                  <span>{formatMoney(ev.prizeMoney)}</span>
                                  {prizeSourceBadge(ev.prizeSource)}
                                </div>
                                <div className="mt-1">
                                  {ev.metricsConfirmed ? (
                                    <span className="text-success">✓ metrics</span>
                                  ) : (
                                    <span className="text-amber-600">○ pending</span>
                                  )}
                                </div>
                              </>
                            )}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
