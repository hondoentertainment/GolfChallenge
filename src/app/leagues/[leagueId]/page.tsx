"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { useCountdown } from "@/hooks/useCountdown";
import { useDarkMode } from "@/hooks/useDarkMode";
import { buildChartData, getChartPath } from "@/hooks/useEarningsChart";

interface User { id: string; username: string; is_admin?: boolean; }
interface League { id: string; name: string; invite_code: string; created_by: string; }
interface Member { user_id: string; username: string; }
interface Payout { position: number; prizeMoney: number; }
interface Tournament { id: string; name: string; start_date: string; end_date: string; course: string; location: string; purse: number; payouts?: Payout[]; }
interface Golfer { id: string; name: string; world_ranking: number; country: string; }
interface PickDetail { id: string; user_id: string; username: string; golfer_name: string; tournament_name: string; prize_money: number; golfer_id: string; }
interface PickOrderEntry { userId: string; username: string; position: number; deadline: string; }
interface Standing { userId: string; username: string; totalPrizeMoney: number; pickCount: number; }
interface ChatMsg { id: string; user_id: string; username: string; message: string; created_at: string; }
interface H2HMatchup { tournament_name: string; p1_golfer: string; p1_prize: number; p2_golfer: string; p2_prize: number; }
interface HistoryPick { tournament_name: string; golfer_name: string; position: string | null; prize_money: number; score: string | null; purse: number; }

function formatMoney(n: number): string { return n >= 1e6 ? "$" + (n / 1e6).toFixed(2) + "M" : "$" + n.toLocaleString("en-US"); }
function formatPurse(n: number): string { return n >= 1e6 ? "$" + (n / 1e6).toFixed(0) + "M" : "$" + n.toLocaleString(); }
function formatDate(s: string): string { return new Date(s + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" }); }
function ordinal(n: number): string { const s = ["th","st","nd","rd"]; const v = n % 100; return n + (s[(v-20)%10] || s[v] || s[0]); }

type Tab = "pick" | "standings" | "schedule" | "payouts" | "h2h" | "history" | "chat" | "season";

export default function LeaguePage() {
  const router = useRouter();
  const params = useParams();
  const leagueId = params.leagueId as string;

  const [user, setUser] = useState<User | null>(null);
  const [league, setLeague] = useState<League | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [currentTournament, setCurrentTournament] = useState<Tournament | null>(null);
  const [selectedTournament, setSelectedTournament] = useState("");
  const [golfers, setGolfers] = useState<Golfer[]>([]);
  const [picks, setPicks] = useState<PickDetail[]>([]);
  const [allPicks, setAllPicks] = useState<PickDetail[]>([]);
  const [pickOrder, setPickOrder] = useState<PickOrderEntry[]>([]);
  const [canPick, setCanPick] = useState<{ canPick: boolean; reason: string; deadline?: string } | null>(null);
  const [usedGolfers, setUsedGolfers] = useState<string[]>([]);
  const [standings, setStandings] = useState<Standing[]>([]);
  const [selectedGolfer, setSelectedGolfer] = useState("");
  const [pickError, setPickError] = useState("");
  const [pickLoading, setPickLoading] = useState(false);
  const [tab, setTab] = useState<Tab>("pick");
  const [loading, setLoading] = useState(true);
  const [golferSearch, setGolferSearch] = useState("");
  const [copiedCode, setCopiedCode] = useState(false);

  // Chat state
  const [chatMessages, setChatMessages] = useState<ChatMsg[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatSending, setChatSending] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Season/Commissioner state
  const [seasonData, setSeasonData] = useState<{ allComplete: boolean; winner: Standing | null; tournamentsPlayed: number; tournamentsTotal: number; standings: Standing[] } | null>(null);
  const [commMsg, setCommMsg] = useState("");
  const { dark, toggle: toggleDark } = useDarkMode();
  const myDeadline = canPick?.deadline || null;
  const countdown = useCountdown(myDeadline);

  // H2H state
  const [h2hPlayer1, setH2hPlayer1] = useState("");
  const [h2hPlayer2, setH2hPlayer2] = useState("");
  const [h2hData, setH2hData] = useState<{ matchups: H2HMatchup[]; p1Total: number; p2Total: number; p1Wins: number; p2Wins: number } | null>(null);

  // History state
  const [historyPlayer, setHistoryPlayer] = useState("");
  const [historyData, setHistoryData] = useState<{ picks: HistoryPick[]; totalEarnings: number } | null>(null);

  const loadPickData = useCallback(async (tid: string) => {
    const res = await fetch(`/api/leagues/${leagueId}/picks?tournamentId=${tid}`);
    const data = await res.json();
    setPicks(data.picks || []);
    setPickOrder(data.pickOrder || []);
    setCanPick(data.userCanPick);
    setUsedGolfers(data.usedGolfers || []);
  }, [leagueId]);

  // Initial load
  useEffect(() => {
    async function load() {
      try {
        const [authRes, leagueRes, tournamentRes, golferRes, standingsRes, allPicksRes] = await Promise.all([
          fetch("/api/auth/me").then(r => r.json()),
          fetch(`/api/leagues/${leagueId}`).then(r => r.json()),
          fetch(`/api/leagues/${leagueId}/tournaments`).then(r => r.json()),
          fetch("/api/tournaments").then(r => r.json()),
          fetch(`/api/leagues/${leagueId}/standings`).then(r => r.json()),
          fetch(`/api/leagues/${leagueId}/picks`).then(r => r.json()),
        ]);
        if (!authRes.user) { router.push("/login"); return; }
        setUser(authRes.user);
        setLeague(leagueRes.league);
        setMembers(leagueRes.members || []);
        setTournaments(golferRes.tournaments || []);
        setCurrentTournament(tournamentRes.currentTournament);
        setGolfers(golferRes.golfers || []);
        setStandings(standingsRes.standings || []);
        setAllPicks(allPicksRes.picks || []);
        const at = tournamentRes.currentTournament;
        if (at) { setSelectedTournament(at.id); await loadPickData(at.id); }
      } catch { router.push("/dashboard"); }
      finally { setLoading(false); }
    }
    load();
  }, [leagueId, router, loadPickData]);

  // Poll picks & standings every 15s
  useEffect(() => {
    if (!selectedTournament || !user) return;
    const id = setInterval(async () => {
      await loadPickData(selectedTournament);
      const sr = await fetch(`/api/leagues/${leagueId}/standings`).then(r => r.json());
      setStandings(sr.standings || []);
    }, 15000);
    return () => clearInterval(id);
  }, [selectedTournament, user, leagueId, loadPickData]);

  // Poll chat every 5s when chat tab is active
  useEffect(() => {
    if (tab !== "chat") return;
    async function loadChat() {
      const res = await fetch(`/api/leagues/${leagueId}/chat`);
      if (res.ok) { const d = await res.json(); setChatMessages(d.messages || []); }
    }
    loadChat();
    const id = setInterval(loadChat, 5000);
    return () => clearInterval(id);
  }, [tab, leagueId]);

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [chatMessages]);

  async function handleTournamentChange(tid: string) {
    setSelectedTournament(tid); setSelectedGolfer(""); setPickError(""); await loadPickData(tid);
  }
  async function handleMakePick() {
    if (!selectedGolfer || !selectedTournament) return;
    setPickError(""); setPickLoading(true);
    try {
      const res = await fetch(`/api/leagues/${leagueId}/picks`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tournamentId: selectedTournament, golferId: selectedGolfer }) });
      const data = await res.json();
      if (!res.ok) { setPickError(data.error); return; }
      await loadPickData(selectedTournament);
      const [sr, ap] = await Promise.all([fetch(`/api/leagues/${leagueId}/standings`).then(r=>r.json()), fetch(`/api/leagues/${leagueId}/picks`).then(r=>r.json())]);
      setStandings(sr.standings || []); setAllPicks(ap.picks || []); setSelectedGolfer("");
    } catch { setPickError("Failed to submit pick"); }
    finally { setPickLoading(false); }
  }
  function copyInviteCode() { if (league) { navigator.clipboard.writeText(league.invite_code); setCopiedCode(true); setTimeout(() => setCopiedCode(false), 2000); } }
  async function sendChat(e: React.FormEvent) {
    e.preventDefault();
    if (!chatInput.trim()) return;
    setChatSending(true);
    try {
      await fetch(`/api/leagues/${leagueId}/chat`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message: chatInput }) });
      setChatInput("");
      const res = await fetch(`/api/leagues/${leagueId}/chat`);
      if (res.ok) { const d = await res.json(); setChatMessages(d.messages || []); }
    } catch { /* ignore */ }
    finally { setChatSending(false); }
  }
  async function loadH2H() {
    if (!h2hPlayer1 || !h2hPlayer2) return;
    const res = await fetch(`/api/leagues/${leagueId}/h2h?player1=${h2hPlayer1}&player2=${h2hPlayer2}`);
    if (res.ok) setH2hData(await res.json());
  }
  async function loadHistory(pid?: string) {
    const id = pid || historyPlayer || user?.id;
    if (!id) return;
    setHistoryPlayer(id);
    const res = await fetch(`/api/leagues/${leagueId}/history?playerId=${id}`);
    if (res.ok) setHistoryData(await res.json());
  }
  async function loadSeason() {
    const res = await fetch(`/api/leagues/${leagueId}/season`);
    if (res.ok) setSeasonData(await res.json());
  }
  async function commAction(action: string, extra?: Record<string, string>) {
    setCommMsg("");
    const res = await fetch(`/api/leagues/${leagueId}/commissioner`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, ...extra }),
    });
    const data = await res.json();
    setCommMsg(res.ok ? data.message || "Done" : data.error || "Failed");
  }

  if (loading) return <div className="flex flex-1 items-center justify-center min-h-screen"><div className="text-muted">Loading league...</div></div>;

  const pickedGolferIds = picks.map(p => p.golfer_id);
  const filteredGolfers = golfers.filter(g => g.name.toLowerCase().includes(golferSearch.toLowerCase()));
  const selectedTournamentData = tournaments.find(t => t.id === selectedTournament);

  const tabs: { key: Tab; label: string }[] = [
    { key: "pick", label: "Pick" },
    { key: "standings", label: "Standings" },
    { key: "history", label: "History" },
    { key: "h2h", label: "H2H" },
    { key: "chat", label: "Chat" },
    { key: "schedule", label: "Schedule" },
    { key: "payouts", label: "Payouts" },
    { key: "season", label: "Season" },
  ];

  return (
    <div className="min-h-screen">
      <nav className="bg-primary text-white px-4 sm:px-6 py-4">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2 sm:gap-4 min-w-0">
            <Link href="/dashboard" className="text-lg sm:text-xl font-bold flex items-center gap-2 shrink-0">
              <span>&#9971;</span><span className="hidden sm:inline">Golf Challenge</span>
            </Link>
            <span className="text-green-200 hidden sm:inline">/</span>
            <span className="font-medium truncate text-sm sm:text-base">{league?.name}</span>
          </div>
          <button onClick={toggleDark} className="text-sm bg-white/10 hover:bg-white/20 px-2 py-1 rounded-lg">{dark ? "\u2600\uFE0F" : "\u{1F319}"}</button>
          <span className="text-green-200 text-sm hidden sm:inline">{user?.username}</span>
        </div>
      </nav>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
        {/* League header */}
        <div className="bg-surface rounded-xl p-4 sm:p-6 border border-border mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold">{league?.name}</h1>
            <p className="text-muted text-xs sm:text-sm mt-1">
              Masters &rarr; U.S. Open &middot; {members.length} player{members.length !== 1 ? "s" : ""} &mdash; {members.map(m => m.username).join(", ")}
            </p>
          </div>
          <button onClick={copyInviteCode} className="font-mono bg-surface-alt px-3 py-1.5 rounded-lg border border-border hover:border-primary text-sm self-start">
            {copiedCode ? "Copied!" : league?.invite_code}
          </button>
        </div>

        {/* Tabs - scrollable on mobile */}
        <div className="flex gap-1 mb-6 bg-surface-alt rounded-lg p-1 overflow-x-auto">
          {tabs.map(t => (
            <button key={t.key} onClick={() => { setTab(t.key); if (t.key === "history" && !historyData) loadHistory(); }}
              className={`px-3 sm:px-5 py-2 rounded-md text-xs sm:text-sm font-medium transition-colors whitespace-nowrap ${tab === t.key ? "bg-primary text-white" : "text-muted hover:text-foreground"}`}>
              {t.label}
            </button>
          ))}
        </div>

        {/* PICK TAB */}
        {tab === "pick" && (
          <div className="space-y-6">
            <div className="bg-surface rounded-xl p-4 sm:p-6 border border-border">
              <label className="block text-sm font-medium mb-2">Tournament</label>
              <select value={selectedTournament} onChange={e => handleTournamentChange(e.target.value)}
                className="w-full px-4 py-2 rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary text-sm">
                <option value="">Select tournament...</option>
                {tournaments.map(t => (
                  <option key={t.id} value={t.id}>{t.name} ({formatDate(t.start_date)} - {formatDate(t.end_date)}){currentTournament?.id === t.id ? " \u2190 Current" : ""}</option>
                ))}
              </select>
              {selectedTournamentData && (
                <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs sm:text-sm text-muted">
                  <span>{selectedTournamentData.course}</span>
                  <span>{selectedTournamentData.location}</span>
                  <span className="font-semibold text-accent">{formatPurse(selectedTournamentData.purse)} purse</span>
                  {selectedTournamentData.payouts && <span className="text-primary font-medium">Winner: {formatMoney(selectedTournamentData.payouts[0]?.prizeMoney || 0)}</span>}
                </div>
              )}
            </div>

            {selectedTournament && pickOrder.length > 0 && (
              <div className="bg-surface rounded-xl p-4 sm:p-6 border border-border">
                <h3 className="font-semibold mb-3 text-sm sm:text-base">Pick Order</h3>
                <div className="space-y-2">
                  {pickOrder.map(po => {
                    const hasPicked = picks.some(p => p.user_id === po.userId);
                    const isMe = po.userId === user?.id;
                    const dl = new Date(po.deadline).toLocaleString("en-US", { timeZone: "America/Los_Angeles", weekday: "short", hour: "numeric", minute: "2-digit" }) + " PDT";
                    return (
                      <div key={po.userId} className={`flex items-center justify-between px-3 sm:px-4 py-2 rounded-lg text-sm ${isMe ? "bg-primary/10 border border-primary/20" : "bg-surface-alt"}`}>
                        <div className="flex items-center gap-2 sm:gap-3">
                          <span className="w-6 h-6 rounded-full bg-primary text-white text-xs flex items-center justify-center font-bold">{po.position + 1}</span>
                          <span className={`font-medium ${isMe ? "text-primary" : ""}`}>{po.username}{isMe ? " (you)" : ""}</span>
                        </div>
                        <div className="text-xs sm:text-sm">{hasPicked ? <span className="text-success font-medium">&#10003; Picked</span> : <span className="text-muted">by {dl}</span>}</div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {selectedTournament && picks.length > 0 && (
              <div className="bg-surface rounded-xl p-4 sm:p-6 border border-border">
                <h3 className="font-semibold mb-3 text-sm sm:text-base">Picks This Week</h3>
                <div className="space-y-2">
                  {picks.map(p => (
                    <div key={p.id} className="flex items-center justify-between px-3 sm:px-4 py-3 rounded-lg bg-surface-alt">
                      <div className="text-sm"><span className="font-medium">{p.username}</span><span className="mx-2 text-muted">&rarr;</span><span className="font-semibold text-primary">{p.golfer_name}</span></div>
                      <div className="text-right">{p.prize_money > 0 ? <span className="text-accent font-bold">{formatMoney(p.prize_money)}</span> : <span className="text-muted text-xs">Awaiting</span>}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {selectedTournament && canPick && (
              <div className="bg-surface rounded-xl p-4 sm:p-6 border border-border">
                {canPick.canPick ? (
                  <>
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-1">
                      <h3 className="font-semibold text-sm sm:text-base">Select Your Golfer</h3>
                      {countdown && countdown !== "Expired" && (
                        <span className="text-xs sm:text-sm font-mono bg-accent/10 text-accent px-3 py-1 rounded-full">{countdown} remaining</span>
                      )}
                    </div>
                    <p className="text-xs sm:text-sm text-muted mb-4">You cannot pick the same golfer more than once.</p>
                    {pickError && <div className="bg-red-50 text-danger border border-red-200 rounded-lg p-3 text-sm mb-4">{pickError}</div>}
                    <input type="text" value={golferSearch} onChange={e => setGolferSearch(e.target.value)} placeholder="Search golfers..."
                      className="w-full max-w-md px-4 py-2 rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary mb-4 text-sm"/>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 max-h-[32rem] overflow-y-auto pr-1">
                      {filteredGolfers.map(g => {
                        const taken = pickedGolferIds.includes(g.id);
                        const used = usedGolfers.includes(g.id);
                        const sel = selectedGolfer === g.id;
                        const dis = taken || used;
                        return (
                          <button key={g.id} onClick={() => !dis && setSelectedGolfer(g.id)} disabled={dis}
                            className={`text-left px-3 sm:px-4 py-3 rounded-lg border transition-colors ${sel ? "border-primary bg-primary/10 ring-2 ring-primary" : dis ? "border-border bg-surface-alt opacity-40 cursor-not-allowed" : "border-border hover:border-primary hover:bg-primary/5 cursor-pointer"}`}>
                            <div className="flex items-center justify-between">
                              <span className="font-medium text-sm">{g.name}</span>
                              <span className="text-xs text-muted">#{g.world_ranking}</span>
                            </div>
                            <div className="text-xs text-muted mt-0.5">{g.country}{taken && <span className="text-danger ml-1">&bull; Taken</span>}{used && !taken && <span className="text-danger ml-1">&bull; Used</span>}</div>
                          </button>
                        );
                      })}
                    </div>
                    {selectedGolfer && (
                      <div className="mt-4 flex flex-col sm:flex-row items-start sm:items-center gap-3">
                        <button onClick={handleMakePick} disabled={pickLoading} className="bg-primary hover:bg-primary-light text-white font-semibold px-6 py-2.5 rounded-lg disabled:opacity-50">{pickLoading ? "Submitting..." : "Lock In Pick"}</button>
                        <span className="text-sm text-muted">Selected: <span className="font-medium text-foreground">{golfers.find(g => g.id === selectedGolfer)?.name}</span></span>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="text-center py-4">
                    <p className="text-muted text-sm">{canPick.reason}</p>
                    {canPick.deadline && <p className="text-xs text-muted mt-1">Your deadline: {new Date(canPick.deadline).toLocaleString("en-US", { timeZone: "America/Los_Angeles", weekday: "long", hour: "numeric", minute: "2-digit" })} PDT</p>}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* STANDINGS TAB */}
        {tab === "standings" && (
          <div className="space-y-6">
            <div className="bg-surface rounded-xl border border-border overflow-x-auto">
              <table className="w-full">
                <thead><tr className="bg-surface-alt border-b border-border">
                  <th className="text-left px-4 sm:px-6 py-3 text-xs sm:text-sm font-semibold text-muted">Rank</th>
                  <th className="text-left px-4 sm:px-6 py-3 text-xs sm:text-sm font-semibold text-muted">Player</th>
                  <th className="text-right px-4 sm:px-6 py-3 text-xs sm:text-sm font-semibold text-muted">Picks</th>
                  <th className="text-right px-4 sm:px-6 py-3 text-xs sm:text-sm font-semibold text-muted">Earnings</th>
                </tr></thead>
                <tbody>
                  {standings.map((s, i) => (
                    <tr key={s.userId} className={`border-b border-border last:border-0 ${s.userId === user?.id ? "bg-primary/5" : ""}`}>
                      <td className="px-4 sm:px-6 py-4"><span className={`font-bold text-lg ${i === 0 ? "text-accent" : ""}`}>{i + 1}</span></td>
                      <td className="px-4 sm:px-6 py-4 font-medium text-sm">{s.username}{s.userId === user?.id ? " (you)" : ""}</td>
                      <td className="px-4 sm:px-6 py-4 text-right text-muted text-sm">{s.pickCount}/{tournaments.length}</td>
                      <td className="px-4 sm:px-6 py-4 text-right font-bold text-accent">{formatMoney(s.totalPrizeMoney)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <h3 className="text-lg font-bold">Pick History</h3>
            {tournaments.map(t => {
              const tp = allPicks.filter(p => p.tournament_name === t.name);
              if (!tp.length) return null;
              return (
                <div key={t.id} className="bg-surface rounded-xl border border-border p-4 sm:p-5">
                  <h4 className="font-semibold text-sm">{t.name} <span className="text-muted font-normal">({formatDate(t.start_date)} &middot; {formatPurse(t.purse)})</span></h4>
                  <div className="space-y-1 mt-2">
                    {tp.map(p => (
                      <div key={p.id} className="flex items-center justify-between px-3 py-2 rounded bg-surface-alt text-sm">
                        <div><span className="font-medium">{p.username}</span><span className="mx-2 text-muted">&rarr;</span><span className="text-primary font-medium">{p.golfer_name}</span></div>
                        <span className={`font-bold ${p.prize_money > 0 ? "text-accent" : "text-muted"}`}>{p.prize_money > 0 ? formatMoney(p.prize_money) : "TBD"}</span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* HISTORY TAB */}
        {tab === "history" && (
          <div className="space-y-6">
            <div className="bg-surface rounded-xl p-4 sm:p-6 border border-border">
              <label className="block text-sm font-medium mb-2">Player</label>
              <select value={historyPlayer || user?.id || ""} onChange={e => { setHistoryPlayer(e.target.value); loadHistory(e.target.value); }}
                className="w-full max-w-xs px-4 py-2 rounded-lg border border-border bg-background text-sm">
                {members.map(m => <option key={m.user_id} value={m.user_id}>{m.username}{m.user_id === user?.id ? " (you)" : ""}</option>)}
              </select>
            </div>
            {historyData && (
              <>
                <div className="bg-accent/10 rounded-xl p-4 sm:p-6 border border-accent/20 text-center">
                  <p className="text-sm text-muted">Total Earnings</p>
                  <p className="text-3xl font-bold text-accent">{formatMoney(historyData.totalEarnings)}</p>
                  <p className="text-sm text-muted mt-1">{historyData.picks.length} tournament{historyData.picks.length !== 1 ? "s" : ""}</p>
                </div>
                <div className="space-y-2">
                  {historyData.picks.map((p, i) => (
                    <div key={i} className="bg-surface rounded-xl p-4 border border-border flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div>
                        <h4 className="font-semibold text-sm">{p.tournament_name}</h4>
                        <p className="text-xs text-muted">{p.golfer_name}{p.position ? ` \u2022 Finished ${p.position}` : ""}{p.score ? ` \u2022 ${p.score}` : ""}</p>
                      </div>
                      <span className={`font-bold text-lg ${p.prize_money > 0 ? "text-accent" : "text-muted"}`}>{p.prize_money > 0 ? formatMoney(p.prize_money) : "TBD"}</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        {/* H2H TAB */}
        {tab === "h2h" && (
          <div className="space-y-6">
            <div className="bg-surface rounded-xl p-4 sm:p-6 border border-border flex flex-col sm:flex-row gap-3">
              <div className="flex-1">
                <label className="block text-xs font-medium mb-1">Player 1</label>
                <select value={h2hPlayer1} onChange={e => setH2hPlayer1(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm">
                  <option value="">Select...</option>
                  {members.map(m => <option key={m.user_id} value={m.user_id}>{m.username}</option>)}
                </select>
              </div>
              <div className="flex items-end justify-center font-bold text-muted">vs</div>
              <div className="flex-1">
                <label className="block text-xs font-medium mb-1">Player 2</label>
                <select value={h2hPlayer2} onChange={e => setH2hPlayer2(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm">
                  <option value="">Select...</option>
                  {members.filter(m => m.user_id !== h2hPlayer1).map(m => <option key={m.user_id} value={m.user_id}>{m.username}</option>)}
                </select>
              </div>
              <div className="flex items-end">
                <button onClick={loadH2H} disabled={!h2hPlayer1 || !h2hPlayer2} className="bg-primary text-white px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-50 w-full sm:w-auto">Compare</button>
              </div>
            </div>
            {h2hData && (
              <>
                <div className="grid grid-cols-3 gap-3 text-center">
                  <div className="bg-surface rounded-xl p-4 border border-border">
                    <p className="text-xs text-muted">{members.find(m => m.user_id === h2hPlayer1)?.username}</p>
                    <p className="text-2xl font-bold text-accent">{formatMoney(h2hData.p1Total)}</p>
                    <p className="text-xs text-muted">{h2hData.p1Wins} week{h2hData.p1Wins !== 1 ? "s" : ""} won</p>
                  </div>
                  <div className="bg-surface-alt rounded-xl p-4 border border-border flex items-center justify-center">
                    <span className="text-xl font-bold text-muted">VS</span>
                  </div>
                  <div className="bg-surface rounded-xl p-4 border border-border">
                    <p className="text-xs text-muted">{members.find(m => m.user_id === h2hPlayer2)?.username}</p>
                    <p className="text-2xl font-bold text-accent">{formatMoney(h2hData.p2Total)}</p>
                    <p className="text-xs text-muted">{h2hData.p2Wins} week{h2hData.p2Wins !== 1 ? "s" : ""} won</p>
                  </div>
                </div>
                <div className="space-y-2">
                  {h2hData.matchups.map((m, i) => (
                    <div key={i} className="bg-surface rounded-xl p-4 border border-border">
                      <p className="text-xs text-muted font-medium mb-2">{m.tournament_name}</p>
                      <div className="flex items-center justify-between text-sm">
                        <div className={m.p1_prize >= m.p2_prize ? "font-bold text-primary" : "text-muted"}>{m.p1_golfer || "No pick"} {m.p1_prize > 0 && <span className="text-accent">{formatMoney(m.p1_prize)}</span>}</div>
                        <div className={m.p2_prize >= m.p1_prize ? "font-bold text-primary text-right" : "text-muted text-right"}>{m.p2_golfer || "No pick"} {m.p2_prize > 0 && <span className="text-accent">{formatMoney(m.p2_prize)}</span>}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        {/* CHAT TAB */}
        {tab === "chat" && (
          <div className="bg-surface rounded-xl border border-border flex flex-col" style={{ height: "500px" }}>
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {chatMessages.length === 0 && <p className="text-center text-muted text-sm py-8">No messages yet. Start the conversation!</p>}
              {chatMessages.map(m => (
                <div key={m.id} className={`flex flex-col ${m.user_id === user?.id ? "items-end" : "items-start"}`}>
                  <div className={`max-w-[80%] rounded-xl px-4 py-2 text-sm ${m.user_id === user?.id ? "bg-primary text-white" : "bg-surface-alt"}`}>
                    {m.user_id !== user?.id && <p className="text-xs font-bold mb-0.5 opacity-75">{m.username}</p>}
                    <p>{m.message}</p>
                  </div>
                  <p className="text-[10px] text-muted mt-0.5 px-1">{new Date(m.created_at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}</p>
                </div>
              ))}
              <div ref={chatEndRef} />
            </div>
            <form onSubmit={sendChat} className="border-t border-border p-3 flex gap-2">
              <input type="text" value={chatInput} onChange={e => setChatInput(e.target.value)} placeholder="Type a message..." maxLength={500}
                className="flex-1 px-4 py-2 rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary text-sm"/>
              <button type="submit" disabled={chatSending || !chatInput.trim()} className="bg-primary text-white px-4 py-2 rounded-lg font-semibold text-sm disabled:opacity-50">Send</button>
            </form>
          </div>
        )}

        {/* SCHEDULE TAB */}
        {tab === "schedule" && (
          <div className="space-y-3">
            {tournaments.map(t => {
              const isPast = new Date(t.end_date) < new Date();
              const isCurrent = currentTournament?.id === t.id;
              return (
                <button key={t.id} onClick={() => { setSelectedTournament(t.id); setTab("pick"); handleTournamentChange(t.id); }}
                  className={`w-full text-left bg-surface rounded-xl p-4 sm:p-5 border transition-colors ${isCurrent ? "border-primary bg-primary/5" : isPast ? "border-border opacity-60" : "border-border hover:border-primary"}`}>
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2"><h3 className="font-semibold text-sm sm:text-base">{t.name}</h3>{isCurrent && <span className="text-xs bg-primary text-white px-2 py-0.5 rounded-full">Current</span>}</div>
                      <p className="text-xs sm:text-sm text-muted mt-1">{t.course} &middot; {t.location}</p>
                    </div>
                    <div className="sm:text-right"><p className="text-xs sm:text-sm font-medium">{formatDate(t.start_date)} - {formatDate(t.end_date)}</p><p className="text-xs sm:text-sm text-accent font-semibold">{formatPurse(t.purse)}</p></div>
                  </div>
                </button>
              );
            })}
          </div>
        )}

        {/* PAYOUTS TAB */}
        {tab === "payouts" && (
          <div className="space-y-6">
            <p className="text-xs sm:text-sm text-muted">Standard PGA Tour payout structure. Winner receives 18% of purse.</p>
            {tournaments.map(t => (
              <div key={t.id} className="bg-surface rounded-xl border border-border overflow-hidden">
                <div className="bg-surface-alt px-4 sm:px-6 py-3 border-b border-border">
                  <h3 className="font-bold text-sm sm:text-base">{t.name}</h3>
                  <p className="text-xs sm:text-sm text-muted">{formatPurse(t.purse)} total purse</p>
                </div>
                <div className="px-4 sm:px-6 py-4">
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-x-6 gap-y-1 text-xs sm:text-sm">
                    {(t.payouts || []).slice(0, 30).map(p => (
                      <div key={p.position} className="flex justify-between py-1 border-b border-border/50">
                        <span className={`${p.position <= 3 ? "font-bold" : ""} ${p.position === 1 ? "text-accent" : ""}`}>{ordinal(p.position)}</span>
                        <span className={`font-medium ${p.position === 1 ? "text-accent font-bold" : ""}`}>{formatMoney(p.prizeMoney)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* SEASON TAB */}
        {tab === "season" && (
          <div className="space-y-6">
            {!seasonData && (
              <button onClick={loadSeason} className="bg-primary text-white px-6 py-2.5 rounded-lg font-semibold">Load Season Summary</button>
            )}
            {seasonData && (
              <>
                {/* Season progress */}
                <div className="bg-surface rounded-xl p-6 border border-border text-center">
                  <p className="text-sm text-muted">Season Progress</p>
                  <p className="text-3xl font-bold">{seasonData.tournamentsPlayed} / {seasonData.tournamentsTotal}</p>
                  <div className="w-full bg-surface-alt rounded-full h-3 mt-3">
                    <div className="bg-primary rounded-full h-3 transition-all" style={{ width: `${(seasonData.tournamentsPlayed / seasonData.tournamentsTotal) * 100}%` }}/>
                  </div>
                  {seasonData.allComplete && seasonData.winner && (
                    <div className="mt-4 bg-accent/10 rounded-xl p-4 border border-accent/20">
                      <p className="text-lg font-bold text-accent">Season Champion: {seasonData.winner.username}</p>
                      <p className="text-accent">{formatMoney(seasonData.winner.totalPrizeMoney)}</p>
                    </div>
                  )}
                </div>

                {/* Earnings chart */}
                {historyData && historyData.picks.length > 0 && (() => {
                  const chartData = buildChartData(historyData.picks);
                  const path = getChartPath(chartData, 600, 200);
                  const maxVal = Math.max(...chartData.map(p => p.cumulative), 1);
                  return (
                    <div className="bg-surface rounded-xl p-6 border border-border">
                      <h3 className="font-semibold mb-3 text-sm">Your Earnings Over Time</h3>
                      <svg viewBox="0 0 600 200" className="w-full h-48">
                        <path d={path} fill="none" stroke="var(--primary)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
                        {chartData.map((p, i) => {
                          const x = 20 + (i / Math.max(chartData.length - 1, 1)) * 560;
                          const y = 20 + 160 - (p.cumulative / maxVal) * 160;
                          return <circle key={i} cx={x} cy={y} r="4" fill="var(--accent)"><title>{p.label}: {formatMoney(p.cumulative)}</title></circle>;
                        })}
                      </svg>
                    </div>
                  );
                })()}

                {/* Tiebreaker standings */}
                <div className="bg-surface rounded-xl border border-border overflow-x-auto">
                  <table className="w-full">
                    <thead><tr className="bg-surface-alt border-b border-border">
                      <th className="text-left px-4 py-3 text-xs font-semibold text-muted">#</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-muted">Player</th>
                      <th className="text-right px-4 py-3 text-xs font-semibold text-muted">Earnings</th>
                      <th className="text-right px-4 py-3 text-xs font-semibold text-muted">Picks</th>
                    </tr></thead>
                    <tbody>
                      {seasonData.standings.map((s: Standing & { top10Count?: number; winCount?: number }, i: number) => (
                        <tr key={s.userId} className={`border-b border-border last:border-0 ${s.userId === user?.id ? "bg-primary/5" : ""}`}>
                          <td className="px-4 py-3 font-bold">{i + 1}</td>
                          <td className="px-4 py-3 font-medium text-sm">{s.username}</td>
                          <td className="px-4 py-3 text-right font-bold text-accent">{formatMoney(s.totalPrizeMoney)}</td>
                          <td className="px-4 py-3 text-right text-muted text-sm">{s.pickCount}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <p className="text-xs text-muted p-3">Tiebreaker: most top-10 finishes, then most wins.</p>
                </div>

                {/* Commissioner tools */}
                {league && (league.created_by === user?.id || user?.is_admin) && (
                  <div className="bg-surface rounded-xl p-6 border border-border">
                    <h3 className="font-semibold mb-4 text-sm">Commissioner Tools</h3>
                    {commMsg && <p className="text-sm mb-3 text-accent font-medium">{commMsg}</p>}
                    <div className="flex flex-wrap gap-2">
                      <button onClick={() => commAction("regenerate_invite")} className="text-xs bg-surface-alt border border-border px-3 py-1.5 rounded-lg hover:border-primary">New Invite Code</button>
                      {members.filter(m => m.user_id !== league.created_by).map(m => (
                        <button key={m.user_id} onClick={() => { if (confirm(`Remove ${m.username}?`)) commAction("remove_member", { targetUserId: m.user_id }); }}
                          className="text-xs bg-danger/10 text-danger border border-danger/20 px-3 py-1.5 rounded-lg">Remove {m.username}</button>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
