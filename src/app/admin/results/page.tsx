"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

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

  if (loading) return <div className="flex flex-1 items-center justify-center min-h-screen"><div className="text-muted">Loading...</div></div>;

  return (
    <div className="min-h-screen">
      <nav className="bg-primary text-white px-6 py-4">
        <div className="max-w-6xl mx-auto flex items-center gap-4">
          <Link href="/dashboard" className="text-xl font-bold flex items-center gap-2"><span>&#9971;</span> Golf Challenge</Link>
          <span className="text-green-200">/</span><span className="font-medium">Admin Results</span>
        </div>
      </nav>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
        <h1 className="text-2xl font-bold mb-6">Enter Tournament Results</h1>

        <div className="bg-surface rounded-xl p-6 border border-border mb-6">
          <label className="block text-sm font-medium mb-2">Tournament</label>
          <select value={selectedTournament} onChange={e => setSelectedTournament(e.target.value)}
            className="w-full px-4 py-2 rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary">
            <option value="">Select...</option>
            {tournaments.map(t => <option key={t.id} value={t.id}>{t.name} (${(t.purse/1e6).toFixed(0)}M)</option>)}
          </select>
        </div>

        {selectedTournament && (
          <>
            <div className="flex flex-wrap gap-3 mb-6">
              <button onClick={handleSync} disabled={syncing}
                className="bg-accent hover:bg-accent-light text-primary-dark font-semibold px-5 py-2 rounded-lg transition-colors disabled:opacity-50">
                {syncing ? "Syncing..." : "Auto-Sync from ESPN"}
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

            {message && <p className="mt-4 text-success font-medium">{message}</p>}
            {error && <p className="mt-4 text-danger font-medium">{error}</p>}
          </>
        )}
      </div>
    </div>
  );
}
