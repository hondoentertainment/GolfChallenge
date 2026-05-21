"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

type Tournament = { id: string; name: string; start_date: string; end_date: string; purse: number };
type DominoStageStatus = "locked" | "blocked" | "ready" | "complete" | "skipped";
type Stage = {
  id: string;
  label: string;
  description: string;
  status: DominoStageStatus;
  detail: string;
  runnable: boolean;
};
type Pipeline = {
  tournament: Tournament;
  phase: "upcoming" | "live" | "complete";
  stages: Stage[];
  firstBlockedId: string | null;
};

const STATUS_LABEL: Record<DominoStageStatus, string> = {
  locked: "Locked",
  blocked: "Waiting",
  ready: "Ready",
  complete: "Done",
  skipped: "N/A",
};

function stageTileClass(s: Stage): string {
  if (s.status === "complete") return "border-emerald-600 bg-emerald-50 text-emerald-950 shadow-[4px_4px_0_0_rgba(5,150,105,0.35)]";
  if (s.status === "ready") return "border-amber-500 bg-amber-50 text-amber-950 ring-2 ring-amber-400/80 shadow-md";
  if (s.status === "blocked") return "border-rose-300 bg-rose-50/80 text-rose-950";
  if (s.status === "skipped") return "border-slate-200 bg-slate-50 text-slate-500";
  return "border-slate-300 bg-slate-100 text-slate-500";
}

export default function AdminEventPipelinePage() {
  const router = useRouter();
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [pipeline, setPipeline] = useState<Pipeline | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingPipeline, setLoadingPipeline] = useState(false);
  const [running, setRunning] = useState<string | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    fetch("/api/admin/event-pipeline")
      .then((r) => {
        if (r.status === 403) {
          router.push("/dashboard");
          return null;
        }
        return r.json();
      })
      .then((data) => {
        if (data?.tournaments) setTournaments(data.tournaments);
      })
      .catch(() => router.push("/dashboard"))
      .finally(() => setLoading(false));
  }, [router]);

  const loadPipeline = useCallback(async (tid: string) => {
    if (!tid) {
      setPipeline(null);
      return;
    }
    setLoadingPipeline(true);
    setMessage(null);
    try {
      const r = await fetch(`/api/admin/event-pipeline?tournamentId=${encodeURIComponent(tid)}`);
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || "Failed");
      setPipeline(data.pipeline);
    } catch (e) {
      setPipeline(null);
      setMessage({ ok: false, text: e instanceof Error ? e.message : "Failed to load pipeline" });
    } finally {
      setLoadingPipeline(false);
    }
  }, []);

  useEffect(() => {
    if (selectedId) void loadPipeline(selectedId);
  }, [selectedId, loadPipeline]);

  async function runStage(stageId: string) {
    if (!selectedId || running) return;
    setRunning(stageId);
    setMessage(null);
    try {
      const r = await fetch("/api/admin/event-pipeline", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tournamentId: selectedId, stageId }),
      });
      const data = await r.json();
      if (data.pipeline) setPipeline(data.pipeline);
      if (!r.ok || data.ok === false) {
        setMessage({ ok: false, text: data.summary || data.error || "Stage failed" });
      } else {
        setMessage({ ok: true, text: data.summary || "Stage completed" });
      }
    } catch {
      setMessage({ ok: false, text: "Request failed" });
    } finally {
      setRunning(null);
      void loadPipeline(selectedId);
    }
  }

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center min-h-screen">
        <div className="text-muted">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <nav className="bg-primary text-white px-6 py-4">
        <div className="max-w-6xl mx-auto flex items-center gap-4 flex-wrap">
          <Link href="/dashboard" className="text-xl font-bold flex items-center gap-2">
            <span>&#9971;</span> Golf Challenge
          </Link>
          <span className="text-green-200">/</span>
          <span className="font-medium">Event pipeline</span>
          <div className="ml-auto flex gap-3 text-sm flex-wrap">
            <Link href="/admin/metrics-review" className="text-green-200 hover:text-white">
              Metrics
            </Link>
            <Link href="/admin/results" className="text-green-200 hover:text-white">
              Results
            </Link>
            <Link href="/admin/jobs" className="text-green-200 hover:text-white">
              Jobs
            </Link>
            <span className="text-white font-medium">Pipeline</span>
          </div>
        </div>
      </nav>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-bold">Event update pipeline</h1>
          <p className="text-sm text-muted mt-1 max-w-3xl">
            Domino-sequenced updates per tournament: each stage unlocks the next. Sign-off is automatic when schedule,
            leaderboard, reconcile, and tie/media gates all pass (including published payout audit when applicable).
          </p>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-end gap-4 mb-8">
          <div className="flex-1">
            <label className="block text-xs font-semibold uppercase tracking-wide text-muted mb-1">Tournament</label>
            <select
              value={selectedId}
              onChange={(e) => setSelectedId(e.target.value)}
              className="w-full max-w-xl border border-border rounded-lg px-3 py-2.5 bg-surface text-primary-dark"
            >
              <option value="">Select an event…</option>
              {tournaments.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} — {t.start_date} (${t.purse?.toLocaleString?.() ?? t.purse})
                </option>
              ))}
            </select>
          </div>
          <button
            type="button"
            onClick={() => selectedId && void loadPipeline(selectedId)}
            disabled={!selectedId || loadingPipeline}
            className="border border-border rounded-lg px-4 py-2.5 font-medium hover:bg-surface-alt disabled:opacity-50"
          >
            Refresh status
          </button>
        </div>

        {message && (
          <div
            className={`mb-6 p-4 rounded-xl text-sm ${
              message.ok ? "bg-success/10 border border-success/25 text-success" : "bg-danger/10 border border-danger/25 text-danger"
            }`}
          >
            {message.text}
          </div>
        )}

        {!selectedId && <p className="text-muted text-sm">Choose a tournament to see the domino chain.</p>}

        {selectedId && loadingPipeline && <p className="text-muted text-sm">Loading pipeline…</p>}

        {pipeline && !loadingPipeline && (
          <>
            <div className="flex flex-wrap items-center gap-2 mb-4">
              <span className="text-sm font-semibold">{pipeline.tournament.name}</span>
              <span
                className={`text-xs font-bold px-2.5 py-0.5 rounded-full uppercase tracking-wide ${
                  pipeline.phase === "complete"
                    ? "bg-emerald-200 text-emerald-900"
                    : pipeline.phase === "live"
                      ? "bg-amber-200 text-amber-900"
                      : "bg-slate-200 text-slate-700"
                }`}
              >
                {pipeline.phase}
              </span>
              <span className="text-xs text-muted">
                Purse ${pipeline.tournament.purse.toLocaleString()} · {pipeline.tournament.start_date} →{" "}
                {pipeline.tournament.end_date}
              </span>
            </div>

            <div className="overflow-x-auto pb-4 -mx-2 px-2">
              <div className="flex items-stretch min-w-max gap-0">
                {pipeline.stages.map((stage, i) => {
                  const showConnector = i < pipeline.stages.length - 1;
                  const canRun =
                    stage.runnable && stage.id !== "signoff" && (running === null || running === stage.id);
                  const isRunning = running === stage.id;
                  return (
                    <div key={stage.id} className="flex items-stretch">
                      <div className="flex flex-col items-center w-[8.5rem] sm:w-[9.25rem] shrink-0">
                        <div
                          className={`relative rounded-2xl border-4 p-3 w-full min-h-[7.5rem] flex flex-col justify-between transition-transform ${stageTileClass(stage)} ${
                            stage.status === "complete" ? "rotate-1" : ""
                          }`}
                        >
                          <div className="pointer-events-none absolute inset-x-2 top-[42%] h-px bg-black/12" aria-hidden />
                          <div className="flex justify-between items-start gap-1">
                            <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-white text-[11px] font-bold">
                              {i + 1}
                            </span>
                            <span className="text-[10px] font-bold uppercase tracking-tighter opacity-80">
                              {STATUS_LABEL[stage.status]}
                            </span>
                          </div>
                          <div className="text-center text-xs font-bold leading-snug px-0.5 pt-1">{stage.label}</div>
                          <p className="text-[10px] leading-snug text-center opacity-90 mt-1 line-clamp-4">{stage.detail}</p>
                        </div>
                        <p className="text-[10px] text-muted text-center mt-2 px-1 line-clamp-2">{stage.description}</p>
                        {stage.id !== "signoff" ? (
                          <button
                            type="button"
                            disabled={!canRun || stage.status === "blocked" || stage.status === "locked"}
                            onClick={() => void runStage(stage.id)}
                            className="mt-2 w-full text-[11px] font-bold py-2 rounded-lg bg-primary text-white hover:opacity-95 disabled:opacity-40 disabled:cursor-not-allowed"
                          >
                            {isRunning ? "Running…" : stage.status === "complete" ? "Run again" : "Run stage"}
                          </button>
                        ) : (
                          <div className="mt-2 w-full text-[11px] text-center text-muted font-medium py-2">
                            Auto-verified
                          </div>
                        )}
                      </div>
                      {showConnector && (
                        <div className="flex flex-col justify-center px-0.5 sm:px-1 shrink-0">
                          <div
                            className={`h-1 w-6 sm:w-10 rounded-full ${
                              pipeline.stages[i]?.status === "complete" ? "bg-emerald-500" : "bg-slate-300"
                            }`}
                            title={pipeline.stages[i]?.status === "complete" ? "Previous stage done" : "Complete prior stage"}
                          />
                          <div className="text-center text-lg leading-none text-slate-400 -mt-1" aria-hidden>
                            ›
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            <p className="text-xs text-muted mt-4 max-w-3xl">
              <strong>Gating:</strong> the API returns 409 if you skip ahead. Reconcile runs globally but the gate counts only
              this event&apos;s orphan picks. After the tournament ends, run stages left to right until Sign-off shows{" "}
              <strong>Done</strong>.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
