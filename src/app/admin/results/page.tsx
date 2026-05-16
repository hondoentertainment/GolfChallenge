"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { PickValueAuditReport } from "@/lib/picks";

interface Tournament { id: string; name: string; purse: number; status: string; }
interface Golfer { id: string; name: string; world_ranking: number; }

export default function AdminResultsPage() {
  const router = useRouter();
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [golfers, setGolfers] = useState<Golfer[]>([]);
  const [selectedTournament, setSelectedTournament] = useState("");
  const [results, setResults] = useState<{ golferId: string; position: string; prizeMoney: number; score: string }[]>([]);
  const [status, setStatus] = useState("completed");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [finalizing, setFinalizing] = useState(false);
  const [finalizingAll, setFinalizingAll] = useState(false);
  const [refreshingPurses, setRefreshingPurses] = useState(false);
  const [fullPayoutUpdate, setFullPayoutUpdate] = useState(false);
  const [refreshingLast5, setRefreshingLast5] = useState(false);
  const [refreshingAllFinishes, setRefreshingAllFinishes] = useState(false);
  const [auditingPicks, setAuditingPicks] = useState(false);
  const [auditResult, setAuditResult] = useState<PickValueAuditReport | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/admin/results")
      .then(r => { if (r.status === 403) { router.push("/dashboard"); return null; } return r.json(); })
      .then(data => { if (data) { setTournaments(data.tournaments); setGolfers(data.golfers); } })
      .catch(() => router.push("/dashboard"))
      .finally(() => setLoading(false));
  }, [router]);

  function addResult() {
    setResults([...results, { golferId: "", position: "", prizeMoney: 0, score: "" }]);
  }

  function updateResult(index: number, field: string, value: string | number) {
    const updated = [...results];
    updated[index] = { ...updated[index], [field]: value };
    setResults(updated);
  }

  function removeResult(index: number) {
    setResults(results.filter((_, i) => i !== index));
  }

  async function handleSave() {
    if (!selectedTournament) return;
    setSaving(true); setError(""); setMessage("");
    try {
      const res = await fetch("/api/admin/results", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tournamentId: selectedTournament, results, status }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error); return; }
      setMessage(`Updated ${data.updated} results`);
    } catch { setError("Failed to save"); }
    finally { setSaving(false); }
  }

  async function handleSync() {
    if (!selectedTournament) return;
    setSyncing(true); setError(""); setMessage("");
    try {
      const res = await fetch("/api/admin/results", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "sync", tournamentId: selectedTournament }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error); return; }
      setMessage(`Synced ${data.updated} results. ${data.errors?.length ? `Errors: ${data.errors.join(", ")}` : ""}`);
    } catch { setError("Failed to sync"); }
    finally { setSyncing(false); }
  }

  async function handleFinalize() {
    if (!selectedTournament) return;
    setFinalizing(true); setError(""); setMessage("");
    try {
      const res = await fetch("/api/admin/results", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "finalize", tournamentId: selectedTournament }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error); return; }
      setMessage(`Finalized: ${data.synced} synced from ESPN, ${data.reconciled.created} created + ${data.reconciled.updated} updated payouts, ${data.notified} leagues notified.`);
    } catch { setError("Failed to finalize"); }
    finally { setFinalizing(false); }
  }

  async function handleFinalizeAll() {
    setFinalizingAll(true); setError(""); setMessage("");
    try {
      const res = await fetch("/api/admin/results", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "finalize-all" }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error); return; }
      const summary = data.finalized?.map((f: { tournamentName: string; synced: number; reconciled: { created: number; updated: number } }) =>
        `${f.tournamentName}: ${f.synced} synced, ${f.reconciled.created + f.reconciled.updated} reconciled`
      ).join("; ") || "No tournaments needed finalization";
      setMessage(summary);
    } catch { setError("Failed to finalize"); }
    finally { setFinalizingAll(false); }
  }

  async function handlePopulateAll() {
    setFinalizingAll(true); setError(""); setMessage("");
    try {
      const res = await fetch("/api/admin/results", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "populate-all" }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error); return; }
      const summary = data.tournaments?.map((t: { name: string; populated: number; errors: number }) =>
        `${t.name}: +${t.populated}${t.errors > 0 ? ` (${t.errors} errors)` : ''}`
      ).join("; ") || `Total: ${data.totalPopulated}`;
      const recalc = data.tieTableRecalc as { tournamentsWithResults?: number; resultRowsUpdated?: number } | undefined;
      const recalcBit = recalc
        ? ` Official tie-table pass: ${recalc.resultRowsUpdated ?? 0} payout row(s) across ${recalc.tournamentsWithResults ?? 0} event(s).`
        : "";
      setMessage(`Populated ${data.totalPopulated} rows across all completed tournaments.${recalcBit} ${summary}`);
    } catch { setError("Failed to populate all"); }
    finally { setFinalizingAll(false); }
  }

  async function handleAuditAllPicks() {
    setAuditingPicks(true);
    setError("");
    setMessage("");
    setAuditResult(null);
    try {
      const res = await fetch("/api/admin/picks-audit");
      const data = (await res.json()) as PickValueAuditReport & { error?: string };
      if (!res.ok) {
        setError(data.error ?? "Audit failed");
        return;
      }
      setAuditResult(data);
      const s = data.summary;
      setMessage(
        `${s.ok ? "Picks audit: all checks passed." : "Picks audit: issues found — see details below."} ` +
          `${s.totalPastNonMissedPicks} past (non-missed) picks · ` +
          `tie-table vs DB drift: ${s.resultRowsOutOfSyncWithTieTable} result row(s) · ` +
          `picks missing finish/prize row: ${s.picksMissingResultData} · ` +
          `picks with $0 but numeric place: ${s.picksZeroPrizeNumericFinish} · ` +
          `${data.completedTournamentsWithResults} completed tournament(s) had result rows.`,
      );
    } catch {
      setError("Failed to run picks audit");
    } finally {
      setAuditingPicks(false);
    }
  }

  async function handleCoverage() {
    setError(""); setMessage("");
    try {
      const res = await fetch("/api/admin/results", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "coverage" }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error); return; }
      const summary = data.tournaments?.map((t: { name: string; resultRows: number; pickedWithResult: number; pickedWithoutResult: number; status: string }) => {
        const flag = t.pickedWithoutResult > 0 ? ' \u26A0\uFE0F' : '';
        return `${t.name}: ${t.resultRows} results, ${t.pickedWithResult}/${t.pickedWithResult + t.pickedWithoutResult} picks resolved${flag}`;
      }).join(" | ");
      setMessage(summary);
    } catch { setError("Failed to fetch coverage"); }
  }

  async function handleRefreshPursePayouts() {
    setRefreshingPurses(true); setError(""); setMessage("");
    try {
      const res = await fetch("/api/admin/results", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "refresh-purse-payouts" }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error); return; }
      setMessage(
        `Purse sync: ${data.pursesUpdated} tournament row(s) updated. ` +
        `Recalculated ${data.resultRowsUpdated} payouts across ${data.tournamentsWithResults} event(s). ` +
        `Reconcile created ${data.reconciled?.created ?? 0}, updated ${data.reconciled?.updated ?? 0}. ` +
        `Badges refreshed for ${data.badgesRefreshed ?? 0} league(s).`
      );
      const tr = await fetch("/api/admin/results").then(r => r.json());
      if (tr.tournaments) setTournaments(tr.tournaments);
    } catch { setError("Failed to refresh payouts from purses"); }
    finally { setRefreshingPurses(false); }
  }

  async function handleRefreshLastCompleted() {
    setRefreshingLast5(true); setError(""); setMessage("");
    try {
      const res = await fetch("/api/admin/results", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "refresh-last-completed", count: 5 }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error); return; }
      const lines = (data.tournaments ?? []).map(
        (t: { name: string; historical: { populated: number }; payoutRowsUpdated: number }) =>
          `${t.name}: ESPN ${t.historical.populated}, table payouts ${t.payoutRowsUpdated} rows`,
      );
      setMessage(
        `Re-synced last ${data.tournaments?.length ?? 0} event(s). ${lines.join(" · ")}. ` +
        `Reconcile +${data.reconciled?.created ?? 0}/${data.reconciled?.updated ?? 0}. Badges: ${data.badgesRefreshed ?? 0} leagues.`,
      );
      const tr = await fetch("/api/admin/results").then((r) => r.json());
      if (tr.tournaments) setTournaments(tr.tournaments);
    } catch { setError("Failed to refresh recent events"); }
    finally { setRefreshingLast5(false); }
  }

  async function handleRefreshAllCompletedFinishes() {
    setRefreshingAllFinishes(true); setError(""); setMessage("");
    try {
      const res = await fetch("/api/admin/results", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "refresh-all-completed-finishes" }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error); return; }
      setMessage(
        `All completed events refreshed. ESPN +${data.populateAll?.totalPopulated ?? 0} rows. ` +
        `Purse tie-table updates: ${data.resultRowsUpdated ?? 0}. ` +
        `Reconcile +${data.reconciled?.created ?? 0}/${data.reconciled?.updated ?? 0}. Badges: ${data.badgesRefreshed ?? 0} leagues.`,
      );
      const tr = await fetch("/api/admin/results").then((r) => r.json());
      if (tr.tournaments) setTournaments(tr.tournaments);
    } catch { setError("Failed to refresh all completed finishes"); }
    finally { setRefreshingAllFinishes(false); }
  }

  async function handleUpdateAllPayouts() {
    setFullPayoutUpdate(true); setError(""); setMessage("");
    try {
      const res = await fetch("/api/admin/results", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "update-all-payouts" }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error); return; }
      const finalizedN = data.finalized?.finalized?.length ?? 0;
      const cov: { name: string; pickedWithoutResult: number }[] = data.coverage?.tournaments ?? [];
      const gapList = cov.filter((t) => t.pickedWithoutResult > 0).map((t) => `${t.name} (${t.pickedWithoutResult})`).join(", ");
      setMessage(
        `Full update complete. Finalized ${finalizedN} recent event(s). ESPN populate +${data.populateAll?.totalPopulated ?? 0}. ` +
        `Purse sync ${data.purseSync?.pursesUpdated ?? 0} tournaments; ${data.purseSync?.resultRowsUpdated ?? 0} payout rows recalculated. ` +
        `Season results: ${data.stats?.totalResultRows ?? 0} rows; ` +
        `reported prize $${(data.stats?.seasonPrizeMoneyReported ?? 0).toLocaleString()}. ` +
        `Picks still missing result: ${data.stats?.totalPicksMissingResults ?? 0} across ${data.stats?.tournamentsWithGaps ?? 0} event(s).` +
        (gapList ? ` Gaps: ${gapList}.` : "") +
        ` Badges: ${data.badgesRefreshed ?? 0} leagues.`
      );
      const tr = await fetch("/api/admin/results").then((r) => r.json());
      if (tr.tournaments) setTournaments(tr.tournaments);
    } catch { setError("Failed full payout update"); }
    finally { setFullPayoutUpdate(false); }
  }

  if (loading) return <div className="flex flex-1 items-center justify-center min-h-screen"><div className="text-muted">Loading...</div></div>;

  return (
    <div className="min-h-screen">
      <nav className="bg-primary text-white px-6 py-4">
        <div className="max-w-6xl mx-auto flex items-center gap-4">
          <Link href="/dashboard" className="text-xl font-bold flex items-center gap-2"><span>&#9971;</span> Golf Challenge</Link>
          <span className="text-green-200">/</span><span className="font-medium">Admin Results</span>
          <div className="ml-auto flex gap-3 text-sm">
            <Link href="/admin/metrics-review" className="text-green-200 hover:text-white">Metrics</Link>
            <span className="text-white font-medium">Results</span>
            <Link href="/admin/jobs" className="text-green-200 hover:text-white">Jobs</Link>
          </div>
        </div>
      </nav>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
        <h1 className="text-2xl font-bold mb-6">Enter Tournament Results</h1>

        <div className="bg-surface rounded-xl p-6 border border-border mb-6">
          <h3 className="font-semibold mb-2">Season-Wide Actions</h3>
          <p className="text-xs text-muted mb-3">ESPN supplies positions/scores; dollar amounts follow the in-app <strong>official PGA Tour / Masters payout tables</strong> and tie rules (not ESPN earnings). Populate pulls historical leaderboards; <strong>Populate All</strong> then reapplies the tie table across the season. Use <strong>Sync purses &amp; payouts</strong> when purses change in code. <strong>Audit all pick values</strong> checks DB vs the table. CLI: <code className="text-xs bg-surface px-1 rounded">npm run apply-official-payouts</code>. Production: <code className="text-xs bg-surface px-1 rounded">GET /api/health</code></p>
          <div className="flex flex-wrap gap-2">
            <button onClick={handlePopulateAll} className="bg-accent hover:bg-accent-light text-primary-dark font-semibold px-4 py-2 rounded-lg text-sm">Populate All Completed</button>
            <button onClick={handleRefreshPursePayouts} disabled={refreshingPurses} className="bg-primary hover:bg-primary-light text-white font-semibold px-4 py-2 rounded-lg text-sm disabled:opacity-50">{refreshingPurses ? "Syncing…" : "Sync purses & payouts"}</button>
            <button onClick={handleRefreshLastCompleted} disabled={refreshingLast5 || refreshingPurses || fullPayoutUpdate || refreshingAllFinishes}
              className="bg-amber-600 hover:bg-amber-500 text-white font-semibold px-4 py-2 rounded-lg text-sm disabled:opacity-50">
              {refreshingLast5 ? "Re-syncing…" : "Re-sync last 5 completed"}
            </button>
            <button onClick={handleRefreshAllCompletedFinishes} disabled={refreshingAllFinishes || refreshingLast5 || refreshingPurses || fullPayoutUpdate || finalizingAll}
              className="bg-orange-700 hover:bg-orange-600 text-white font-semibold px-4 py-2 rounded-lg text-sm disabled:opacity-50">
              {refreshingAllFinishes ? "Refreshing all…" : "Refresh all completed finishes"}
            </button>
            <button onClick={handleUpdateAllPayouts} disabled={fullPayoutUpdate || refreshingPurses || finalizingAll || refreshingLast5 || refreshingAllFinishes}
              className="bg-primary-dark hover:opacity-90 text-white font-semibold px-4 py-2 rounded-lg text-sm disabled:opacity-50">
              {fullPayoutUpdate ? "Updating…" : "Update all payouts & stats"}
            </button>
            <button onClick={handleCoverage} className="bg-surface-alt border border-border hover:border-primary font-medium px-4 py-2 rounded-lg text-sm">Coverage Report</button>
            <button
              type="button"
              onClick={handleAuditAllPicks}
              disabled={auditingPicks || refreshingPurses || fullPayoutUpdate || refreshingLast5 || refreshingAllFinishes}
              className="bg-teal-700 hover:bg-teal-600 text-white font-semibold px-4 py-2 rounded-lg text-sm disabled:opacity-50"
            >
              {auditingPicks ? "Auditing picks…" : "Audit all pick values"}
            </button>
          </div>
        </div>

        {(message || error) && (
          <div className="mb-6 space-y-2">
            {message && <p className="text-success font-medium text-sm break-words">{message}</p>}
            {error && <p className="text-danger font-medium text-sm">{error}</p>}
          </div>
        )}

        {auditResult && (
          <div className="mb-6 bg-surface rounded-xl p-4 border border-border">
            <p className="text-xs font-medium text-muted mb-2">
              Full audit (season {auditResult.season}) — compares stored prizes to the in-app tie-split table, and lists picks on finished events that lack results or show $0 with a paying position.
            </p>
            <details className="text-sm">
              <summary className="cursor-pointer font-medium text-primary select-none">Raw JSON</summary>
              <pre className="mt-3 text-xs p-3 bg-surface-alt rounded-lg overflow-auto max-h-[min(28rem,50vh)] whitespace-pre-wrap break-words border border-border">
                {JSON.stringify(auditResult, null, 2)}
              </pre>
            </details>
          </div>
        )}

        <div className="bg-surface rounded-xl p-6 border border-border mb-6">
          <label className="block text-sm font-medium mb-2">Tournament</label>
          <select value={selectedTournament} onChange={e => setSelectedTournament(e.target.value)}
            className="w-full px-4 py-2 rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary">
            <option value="">Select...</option>
            {tournaments.map(t => <option key={t.id} value={t.id}>{t.name} (${(t.purse/1e6).toFixed(0)}M)</option>)}
          </select>
        </div>

        <div className="bg-surface rounded-xl p-6 border border-border mb-6">
          <h3 className="font-semibold mb-2">Finalize All Recent Tournaments</h3>
          <p className="text-xs text-muted mb-3">Finds any tournament that ended in the last 14 days but isn&apos;t marked completed, syncs ESPN, reconciles payouts, and notifies players.</p>
          <button onClick={handleFinalizeAll} disabled={finalizingAll}
            className="bg-primary hover:bg-primary-light text-white font-semibold px-5 py-2 rounded-lg transition-colors disabled:opacity-50">
            {finalizingAll ? "Finalizing..." : "Finalize All Recent"}
          </button>
        </div>

        {selectedTournament && (
          <>
            <div className="flex flex-wrap gap-3 mb-6">
              <button onClick={handleSync} disabled={syncing}
                className="bg-accent hover:bg-accent-light text-primary-dark font-semibold px-5 py-2 rounded-lg transition-colors disabled:opacity-50">
                {syncing ? "Syncing..." : "Auto-Sync from ESPN"}
              </button>
              <button onClick={handleFinalize} disabled={finalizing}
                className="bg-primary hover:bg-primary-light text-white font-semibold px-5 py-2 rounded-lg transition-colors disabled:opacity-50">
                {finalizing ? "Finalizing..." : "Finalize Payouts"}
              </button>
              <select value={status} onChange={e => setStatus(e.target.value)}
                className="px-4 py-2 rounded-lg border border-border bg-background">
                <option value="upcoming">Upcoming</option>
                <option value="in_progress">In Progress</option>
                <option value="completed">Completed</option>
              </select>
            </div>

            <div className="bg-surface rounded-xl p-6 border border-border mb-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold">Manual Results</h3>
                <button onClick={addResult} className="text-sm bg-primary text-white px-3 py-1 rounded-lg">+ Add Result</button>
              </div>
              <div className="space-y-3">
                {results.map((r, i) => (
                  <div key={i} className="flex flex-wrap gap-2 items-center bg-surface-alt p-3 rounded-lg">
                    <select value={r.golferId} onChange={e => updateResult(i, "golferId", e.target.value)}
                      className="flex-1 min-w-[180px] px-3 py-1.5 rounded border border-border bg-background text-sm">
                      <option value="">Golfer...</option>
                      {golfers.map(g => <option key={g.id} value={g.id}>{g.name} (#{g.world_ranking})</option>)}
                    </select>
                    <input type="text" placeholder="Pos" value={r.position} onChange={e => updateResult(i, "position", e.target.value)}
                      className="w-16 px-3 py-1.5 rounded border border-border bg-background text-sm"/>
                    <input type="number" placeholder="Prize $" value={r.prizeMoney || ""} onChange={e => updateResult(i, "prizeMoney", Number(e.target.value))}
                      className="w-28 px-3 py-1.5 rounded border border-border bg-background text-sm"/>
                    <input type="text" placeholder="Score" value={r.score} onChange={e => updateResult(i, "score", e.target.value)}
                      className="w-20 px-3 py-1.5 rounded border border-border bg-background text-sm"/>
                    <button onClick={() => removeResult(i)} className="text-danger text-sm px-2">&times;</button>
                  </div>
                ))}
              </div>
            </div>

            <button onClick={handleSave} disabled={saving || results.length === 0}
              className="bg-primary hover:bg-primary-light text-white font-semibold px-6 py-2.5 rounded-lg disabled:opacity-50">
              {saving ? "Saving..." : "Save Results"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
