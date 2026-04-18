"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { useCountdown } from "@/hooks/useCountdown";
import { useDarkMode } from "@/hooks/useDarkMode";
import { buildChartData, getChartPath } from "@/hooks/useEarningsChart";
import { usePushNotifications } from "@/hooks/usePushNotifications";
import { useLiveLeaderboard } from "@/hooks/useLiveLeaderboard";
import { getGolferPhotoUrl, getGolferInitials } from "@/lib/golfer-photos";

interface User { id: string; username: string; is_admin?: boolean; }
interface League { id: string; name: string; invite_code: string; created_by: string; }
interface Member { user_id: string; username: string; }
interface Payout { position: number; prizeMoney: number; }
interface Tournament { id: string; name: string; start_date: string; end_date: string; course: string; location: string; purse: number; payouts?: Payout[]; }
interface Golfer { id: string; name: string; world_ranking: number; country: string; }
interface PickDetail { id: string; user_id: string; username: string; golfer_name: string; tournament_name: string; prize_money: number; golfer_id: string; position: string | null; score: string | null; }
interface PickOrderEntry { userId: string; username: string; position: number; deadline: string; }
interface Standing { userId: string; username: string; totalPrizeMoney: number; pickCount: number; }
interface ChatMsg { id: string; user_id: string; username: string; message: string; created_at: string; }
interface H2HMatchup { tournament_name: string; p1_golfer: string; p1_prize: number; p2_golfer: string; p2_prize: number; }
interface HistoryPick { tournament_name: string; golfer_name: string; position: string | null; prize_money: number; score: string | null; purse: number; }
interface TournamentResult { golferName: string; position: string; prizeMoney: number; score: string; }
interface TournamentResults { tournamentId: string; tournamentName: string; results: TournamentResult[]; }

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

  // Field filtering, push notifications, golfer form, invite link
  const [fieldGolferIds, setFieldGolferIds] = useState<string[]>([]);
  const [showFieldOnly, setShowFieldOnly] = useState(false);
  const [golferForm, setGolferForm] = useState<{ name: string; stats: { totalEarnings: number; avgEarnings: number; top10s: number; events: number }; recentResults: { tournament_name: string; position: string; prize_money: number }[] } | null>(null);
  const [golferFormLoading, setGolferFormLoading] = useState(false);
  const [inviteUrl, setInviteUrl] = useState("");
  const [copiedInvite, setCopiedInvite] = useState(false);
  const { permission: pushPerm, supported: pushSupported, requestPermission, sendLocalNotification } = usePushNotifications();

  // Weekly earnings per user for sparklines
  const [weeklyEarnings, setWeeklyEarnings] = useState<Record<string, number[]>>({});

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

  // Tournament results per golfer (actual earnings by event)
  const [tournamentResults, setTournamentResults] = useState<TournamentResults[]>([]);

  // Live leaderboard from ESPN (client-side, updates every 60s during active events)
  const liveLeaderboard = useLiveLeaderboard(tab === "pick");

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
        setFieldGolferIds(golferRes.fieldGolferIds || []);
        setStandings(standingsRes.standings || []);
        setAllPicks(allPicksRes.picks || []);

        // Build weekly earnings for sparklines
        const we: Record<string, number[]> = {};
        for (const s of (standingsRes.standings || [])) {
          const playerPicks = (allPicksRes.picks || []).filter((p: PickDetail) => p.user_id === s.userId);
          we[s.userId] = (tournamentRes.tournaments || []).map((t: Tournament) => {
            const pick = playerPicks.find((p: PickDetail) => p.tournament_name === t.name);
            return pick?.prize_money || 0;
          });
        }
        setWeeklyEarnings(we);

        // Fetch invite URL
        fetch(`/api/leagues/${leagueId}/invite`).then(r => r.ok ? r.json() : null).then(d => {
          if (d?.inviteUrl) setInviteUrl(d.inviteUrl);
        }).catch(() => {});
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
  async function loadTournamentResults() {
    try {
      const res = await fetch("/api/tournaments/results");
      if (res.ok) { const d = await res.json(); setTournamentResults(d.results || []); }
    } catch { /* ignore */ }
  }
  async function loadGolferForm(golferId: string) {
    setGolferFormLoading(true);
    try {
      const res = await fetch(`/api/golfers/${golferId}/form`);
      if (res.ok) setGolferForm(await res.json());
    } catch { /* ignore */ }
    finally { setGolferFormLoading(false); }
  }
  function copyInviteUrl() {
    if (inviteUrl) { navigator.clipboard.writeText(inviteUrl); setCopiedInvite(true); setTimeout(() => setCopiedInvite(false), 2000); }
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
  const filteredGolfers = golfers.filter(g => {
    const matchesSearch = g.name.toLowerCase().includes(golferSearch.toLowerCase());
    const inField = !showFieldOnly || fieldGolferIds.length === 0 || fieldGolferIds.includes(g.id);
    return matchesSearch && inField;
  });
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
          <div className="flex flex-wrap gap-2 self-start">
            <button onClick={copyInviteCode} className="font-mono bg-surface-alt px-3 py-1.5 rounded-lg border border-border hover:border-primary text-xs">
              {copiedCode ? "Copied!" : league?.invite_code}
            </button>
            {inviteUrl && (
              <button onClick={copyInviteUrl} className="bg-primary/10 text-primary px-3 py-1.5 rounded-lg border border-primary/20 hover:border-primary text-xs font-medium">
                {copiedInvite ? "Link copied!" : "Share invite link"}
              </button>
            )}
            {pushSupported && pushPerm !== "granted" && (
              <button onClick={requestPermission} className="bg-accent/10 text-accent px-3 py-1.5 rounded-lg border border-accent/20 text-xs font-medium">
                Enable notifications
              </button>
            )}
          </div>
        </div>

        {/* Tabs - scrollable on mobile */}
        <div className="flex gap-1 mb-6 bg-surface-alt rounded-lg p-1 overflow-x-auto">
          {tabs.map(t => (
            <button key={t.key} onClick={() => { setTab(t.key); if (t.key === "history" && !historyData) loadHistory(); if (t.key === "payouts" && tournamentResults.length === 0) loadTournamentResults(); }}
              className={`px-3 sm:px-5 py-2 rounded-md text-xs sm:text-sm font-medium transition-colors whitespace-nowrap ${tab === t.key ? "bg-primary text-white" : "text-muted hover:text-foreground"}`}>
              {t.label}
            </button>
          ))}
        </div>

        {/* PICK TAB */}
        {tab === "pick" && (
          <div className="space-y-6">
            {/* My Picks summary — shows every golfer the current player selected with payouts */}
            {user && (() => {
              const myPicks = allPicks.filter(p => p.user_id === user.id);
              if (myPicks.length === 0) return null;
              const myTotal = myPicks.reduce((s, p) => s + p.prize_money, 0);
              return (
                <div className="bg-surface rounded-xl border border-border overflow-hidden">
                  <div className="bg-surface-alt px-4 sm:px-6 py-3 border-b border-border flex items-center justify-between">
                    <h3 className="font-semibold text-sm sm:text-base">My Picks &amp; Payouts</h3>
                    <span className="font-bold text-accent">{formatMoney(myTotal)}</span>
                  </div>
                  <div className="divide-y divide-border/30">
                    {tournaments.map(t => {
                      const pick = myPicks.find(p => p.tournament_name === t.name);
                      const isPast = new Date(t.end_date) < new Date();
                      const isCurrent = currentTournament?.id === t.id;
                      return (
                        <div key={t.id} className={`flex items-center justify-between px-4 sm:px-6 py-2.5 text-sm ${isCurrent ? "bg-primary/5" : ""}`}>
                          <div className="flex items-center gap-3 min-w-0">
                            <span className={`text-xs w-16 shrink-0 ${isPast ? "text-muted" : isCurrent ? "text-primary font-medium" : "text-muted"}`}>
                              {isCurrent ? "Live" : formatDate(t.start_date)}
                            </span>
                            <span className="text-muted truncate hidden sm:inline">{t.name.replace(' Tournament', '').replace('Championship', 'Champ.')}</span>
                            {pick ? (
                              <span className="font-medium text-primary truncate">{pick.golfer_name}</span>
                            ) : (
                              <span className="text-muted italic">{isPast ? "No pick" : "Upcoming"}</span>
                            )}
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            {pick?.position && <span className="text-xs text-muted">({pick.position})</span>}
                            <span className={`font-semibold ${pick && pick.prize_money > 0 ? "text-accent" : "text-muted"}`}>
                              {pick ? (pick.prize_money > 0 ? formatMoney(pick.prize_money) : isPast ? "$0" : "TBD") : "-"}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })()}

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
                      <div className="text-sm">
                        <span className="font-medium">{p.username}</span>
                        <span className="mx-2 text-muted">&rarr;</span>
                        <span className="font-semibold text-primary">{p.golfer_name}</span>
                        {p.position && <span className="ml-2 text-xs text-muted">({p.position})</span>}
                      </div>
                      <div className="text-right">{p.prize_money > 0 ? <span className="text-accent font-bold">{formatMoney(p.prize_money)}</span> : <span className="text-muted text-xs">Awaiting</span>}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Live Leaderboard */}
            {liveLeaderboard.status === "in" && liveLeaderboard.competitors.length > 0 && (
              <div className="bg-surface rounded-xl p-4 sm:p-6 border border-primary/30">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-semibold text-sm sm:text-base flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse"></span>
                    Live Leaderboard
                  </h3>
                  <span className="text-xs text-muted">{liveLeaderboard.eventName}{liveLeaderboard.lastUpdated ? ` \u2022 ${liveLeaderboard.lastUpdated.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}` : ""}</span>
                </div>
                <div className="space-y-0 max-h-80 overflow-y-auto">
                  <div className="grid grid-cols-[2.5rem_1fr_3rem_3.5rem] gap-x-2 text-xs font-semibold text-muted border-b border-border pb-1 mb-1 sticky top-0 bg-surface">
                    <span>Pos</span><span>Player</span><span className="text-right">Scr</span><span className="text-right">Thru</span>
                  </div>
                  {liveLeaderboard.competitors.slice(0, 30).map((c, i) => {
                    const isPicked = picks.some(p => p.golfer_name.toLowerCase() === c.name.toLowerCase());
                    return (
                      <div key={i} className={`grid grid-cols-[2.5rem_1fr_3rem_3.5rem] gap-x-2 text-xs sm:text-sm py-1 border-b border-border/20 ${isPicked ? "bg-primary/10 font-semibold" : ""}`}>
                        <span className={i === 0 ? "text-accent font-bold" : "text-muted"}>{c.position || "-"}</span>
                        <span className={`truncate ${isPicked ? "text-primary" : ""}`}>{c.name}</span>
                        <span className="text-right font-medium">{c.score || "-"}</span>
                        <span className="text-right text-muted">{c.thru}</span>
                      </div>
                    );
                  })}
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
                    <div className="flex flex-col sm:flex-row gap-2 mb-4">
                      <input type="text" value={golferSearch} onChange={e => setGolferSearch(e.target.value)} placeholder="Search golfers..."
                        className="flex-1 max-w-md px-4 py-2 rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary text-sm"/>
                      {fieldGolferIds.length > 0 && (
                        <label className="flex items-center gap-2 text-xs font-medium text-muted cursor-pointer select-none">
                          <input type="checkbox" checked={showFieldOnly} onChange={e => setShowFieldOnly(e.target.checked)}
                            className="rounded border-border"/>
                          In field only ({fieldGolferIds.length})
                        </label>
                      )}
                    </div>

                    {/* Golfer form popup */}
                    {golferForm && (
                      <div className="bg-surface border border-border rounded-xl p-4 mb-4 relative">
                        <button onClick={() => setGolferForm(null)} className="absolute top-2 right-3 text-muted hover:text-foreground">&times;</button>
                        <h4 className="font-bold text-sm mb-2">{golferForm.name} - Recent Form</h4>
                        {golferFormLoading ? <p className="text-muted text-xs">Loading...</p> : (
                          <>
                            <div className="flex gap-4 text-xs text-muted mb-2">
                              <span>Avg: ${golferForm.stats.avgEarnings.toLocaleString()}</span>
                              <span>Top 10s: {golferForm.stats.top10s}/{golferForm.stats.events}</span>
                            </div>
                            <div className="space-y-1">
                              {golferForm.recentResults.map((r, i) => (
                                <div key={i} className="flex justify-between text-xs px-2 py-1 bg-surface-alt rounded">
                                  <span>{r.tournament_name}</span>
                                  <span className="font-medium">{r.position} {r.prize_money > 0 && `($${r.prize_money.toLocaleString()})`}</span>
                                </div>
                              ))}
                              {golferForm.recentResults.length === 0 && <p className="text-xs text-muted">No recent results</p>}
                            </div>
                          </>
                        )}
                      </div>
                    )}

                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 max-h-[32rem] overflow-y-auto pr-1">
                      {filteredGolfers.map(g => {
                        const taken = pickedGolferIds.includes(g.id);
                        const used = usedGolfers.includes(g.id);
                        const sel = selectedGolfer === g.id;
                        const dis = taken || used;
                        return (
                          <button key={g.id} onClick={() => { if (!dis) setSelectedGolfer(g.id); loadGolferForm(g.id); }} disabled={dis}
                            className={`text-left px-3 sm:px-4 py-2.5 rounded-lg border transition-colors ${sel ? "border-primary bg-primary/10 ring-2 ring-primary" : dis ? "border-border bg-surface-alt opacity-40 cursor-not-allowed" : "border-border hover:border-primary hover:bg-primary/5 cursor-pointer"}`}>
                            <div className="flex items-center gap-2.5">
                              {(() => { const photo = getGolferPhotoUrl(g.name); return photo ? (
                                <img src={photo} alt="" className="w-8 h-8 rounded-full object-cover bg-surface-alt shrink-0" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                              ) : (
                                <span className="w-8 h-8 rounded-full bg-primary/10 text-primary text-xs font-bold flex items-center justify-center shrink-0">{getGolferInitials(g.name)}</span>
                              ); })()}
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center justify-between">
                                  <span className="font-medium text-sm truncate">{g.name}</span>
                                  <span className="text-xs text-muted ml-1">#{g.world_ranking}</span>
                                </div>
                                <div className="text-xs text-muted">{g.country}{taken && <span className="text-danger ml-1">&bull; Taken</span>}{used && !taken && <span className="text-danger ml-1">&bull; Used</span>}</div>
                              </div>
                            </div>
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
            {/* Comprehensive earnings table: one row per player, one column per tournament */}
            <div className="bg-surface rounded-xl border border-border overflow-x-auto">
              <table className="w-full text-xs sm:text-sm">
                <thead>
                  <tr className="bg-surface-alt border-b border-border">
                    <th className="text-left px-3 sm:px-4 py-3 font-semibold text-muted sticky left-0 bg-surface-alt z-10">#</th>
                    <th className="text-left px-3 sm:px-4 py-3 font-semibold text-muted sticky left-8 bg-surface-alt z-10">Player</th>
                    {tournaments.map(t => (
                      <th key={t.id} className="text-center px-2 sm:px-3 py-3 font-semibold text-muted whitespace-nowrap min-w-[7rem]">
                        <div>{t.name.replace(' Tournament', '').replace('Championship', 'Champ.').replace('Charles Schwab ', 'Schwab ')}</div>
                      </th>
                    ))}
                    <th className="text-right px-3 sm:px-4 py-3 font-semibold text-muted">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {standings.map((s, rank) => {
                    const playerPicks = allPicks.filter(p => p.user_id === s.userId);
                    const isMe = s.userId === user?.id;
                    return (
                      <tr key={s.userId} className={`border-b border-border last:border-0 ${isMe ? "bg-primary/5" : ""}`}>
                        <td className={`px-3 sm:px-4 py-3 font-bold sticky left-0 z-10 ${isMe ? "bg-primary/5" : "bg-surface"} ${rank === 0 ? "text-accent" : ""}`}>{rank + 1}</td>
                        <td className={`px-3 sm:px-4 py-3 font-medium sticky left-8 z-10 whitespace-nowrap ${isMe ? "bg-primary/5" : "bg-surface"}`}>{s.username}{isMe ? " (you)" : ""}</td>
                        {tournaments.map(t => {
                          const pick = playerPicks.find(p => p.tournament_name === t.name);
                          return (
                            <td key={t.id} className="px-2 sm:px-3 py-3 text-center">
                              {pick ? (
                                <div>
                                  <div className={`font-medium truncate max-w-[6rem] mx-auto ${pick.prize_money > 0 ? "text-primary" : "text-muted"}`}>{pick.golfer_name.split(' ').pop()}</div>
                                  <div className={`text-xs ${pick.prize_money > 0 ? "text-accent font-semibold" : "text-muted"}`}>
                                    {pick.position && <span className="mr-1">({pick.position})</span>}
                                    {pick.prize_money > 0 ? formatMoney(pick.prize_money) : "TBD"}
                                  </div>
                                </div>
                              ) : (
                                <span className="text-muted">-</span>
                              )}
                            </td>
                          );
                        })}
                        <td className="px-3 sm:px-4 py-3 text-right font-bold text-accent whitespace-nowrap">{formatMoney(s.totalPrizeMoney)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Per-player running totals with chosen golfers */}
            <h3 className="text-lg font-bold">Running Totals</h3>
            {standings.map((s, rank) => {
              const playerPicks = allPicks.filter(p => p.user_id === s.userId);
              let runningTotal = 0;
              const rows = tournaments.map(t => {
                const pick = playerPicks.find(p => p.tournament_name === t.name);
                if (pick) runningTotal += pick.prize_money;
                return { tournament: t, pick, runningTotal };
              });
              return (
                <div key={s.userId} className={`bg-surface rounded-xl border ${s.userId === user?.id ? "border-primary" : "border-border"} overflow-hidden`}>
                  <div className="bg-surface-alt px-4 sm:px-6 py-3 border-b border-border flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${rank === 0 ? "bg-accent text-white" : "bg-surface text-muted border border-border"}`}>{rank + 1}</span>
                      <span className="font-bold text-sm sm:text-base">{s.username}{s.userId === user?.id ? " (you)" : ""}</span>
                    </div>
                    <span className="font-bold text-accent">{formatMoney(s.totalPrizeMoney)}</span>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs sm:text-sm">
                      <thead>
                        <tr className="border-b border-border/50">
                          <th className="text-left px-4 py-2 font-semibold text-muted">Tournament</th>
                          <th className="text-left px-4 py-2 font-semibold text-muted">Golfer</th>
                          <th className="text-center px-2 py-2 font-semibold text-muted hidden sm:table-cell">Pos</th>
                          <th className="text-right px-4 py-2 font-semibold text-muted">Earned</th>
                          <th className="text-right px-4 py-2 font-semibold text-muted">Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map(({ tournament: t, pick, runningTotal: rt }) => (
                          <tr key={t.id} className="border-b border-border/20 last:border-0">
                            <td className="px-4 py-2 text-muted whitespace-nowrap">{t.name.replace(' Tournament', '').replace('Championship', 'Champ.')}</td>
                            <td className="px-4 py-2 font-medium text-primary whitespace-nowrap">
                              {pick ? pick.golfer_name : <span className="text-muted italic">No pick</span>}
                            </td>
                            <td className="text-center px-2 py-2 text-muted hidden sm:table-cell">{pick?.position || "-"}</td>
                            <td className={`px-4 py-2 text-right font-medium ${pick && pick.prize_money > 0 ? "text-accent" : "text-muted"}`}>
                              {pick ? (pick.prize_money > 0 ? formatMoney(pick.prize_money) : "TBD") : "-"}
                            </td>
                            <td className="px-4 py-2 text-right font-bold">{rt > 0 ? formatMoney(rt) : "-"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
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
            {h2hData && (() => {
              const p1Name = members.find(m => m.user_id === h2hPlayer1)?.username || "Player 1";
              const p2Name = members.find(m => m.user_id === h2hPlayer2)?.username || "Player 2";
              let p1Cum = 0;
              let p2Cum = 0;
              const matchupsWithTotals = h2hData.matchups.map(m => {
                p1Cum += m.p1_prize;
                p2Cum += m.p2_prize;
                return { ...m, p1Cum, p2Cum };
              });
              return (
              <>
                <div className="grid grid-cols-3 gap-3 text-center">
                  <div className="bg-surface rounded-xl p-4 border border-border">
                    <p className="text-xs text-muted">{p1Name}</p>
                    <p className="text-2xl font-bold text-accent">{formatMoney(h2hData.p1Total)}</p>
                    <p className="text-xs text-muted">{h2hData.p1Wins} week{h2hData.p1Wins !== 1 ? "s" : ""} won</p>
                  </div>
                  <div className="bg-surface-alt rounded-xl p-4 border border-border flex items-center justify-center">
                    <span className="text-xl font-bold text-muted">VS</span>
                  </div>
                  <div className="bg-surface rounded-xl p-4 border border-border">
                    <p className="text-xs text-muted">{p2Name}</p>
                    <p className="text-2xl font-bold text-accent">{formatMoney(h2hData.p2Total)}</p>
                    <p className="text-xs text-muted">{h2hData.p2Wins} week{h2hData.p2Wins !== 1 ? "s" : ""} won</p>
                  </div>
                </div>

                {/* H2H cumulative breakdown */}
                <div className="bg-surface rounded-xl border border-border overflow-x-auto">
                  <table className="w-full text-xs sm:text-sm">
                    <thead>
                      <tr className="bg-surface-alt border-b border-border">
                        <th className="text-left px-3 sm:px-4 py-2 font-semibold text-muted">Tournament</th>
                        <th className="text-left px-2 sm:px-3 py-2 font-semibold text-muted">{p1Name}</th>
                        <th className="text-right px-2 py-2 font-semibold text-muted">Earned</th>
                        <th className="text-right px-2 sm:px-3 py-2 font-semibold text-accent">Total</th>
                        <th className="text-left px-2 sm:px-3 py-2 font-semibold text-muted">{p2Name}</th>
                        <th className="text-right px-2 py-2 font-semibold text-muted">Earned</th>
                        <th className="text-right px-2 sm:px-3 py-2 font-semibold text-accent">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {matchupsWithTotals.map((m, i) => {
                        const p1Won = m.p1_prize > m.p2_prize;
                        const p2Won = m.p2_prize > m.p1_prize;
                        return (
                        <tr key={i} className="border-b border-border/30 last:border-0">
                          <td className="px-3 sm:px-4 py-2 text-muted whitespace-nowrap">{m.tournament_name.replace(' Tournament', '').replace('Championship', 'Champ.')}</td>
                          <td className={`px-2 sm:px-3 py-2 whitespace-nowrap ${p1Won ? "font-semibold text-primary" : "text-muted"}`}>{m.p1_golfer || <span className="italic">No pick</span>}</td>
                          <td className={`px-2 py-2 text-right ${m.p1_prize > 0 ? (p1Won ? "text-accent font-semibold" : "") : "text-muted"}`}>{m.p1_prize > 0 ? formatMoney(m.p1_prize) : "-"}</td>
                          <td className={`px-2 sm:px-3 py-2 text-right font-bold ${m.p1Cum >= m.p2Cum ? "text-accent" : ""}`}>{m.p1Cum > 0 ? formatMoney(m.p1Cum) : "-"}</td>
                          <td className={`px-2 sm:px-3 py-2 whitespace-nowrap ${p2Won ? "font-semibold text-primary" : "text-muted"}`}>{m.p2_golfer || <span className="italic">No pick</span>}</td>
                          <td className={`px-2 py-2 text-right ${m.p2_prize > 0 ? (p2Won ? "text-accent font-semibold" : "") : "text-muted"}`}>{m.p2_prize > 0 ? formatMoney(m.p2_prize) : "-"}</td>
                          <td className={`px-2 sm:px-3 py-2 text-right font-bold ${m.p2Cum >= m.p1Cum ? "text-accent" : ""}`}>{m.p2Cum > 0 ? formatMoney(m.p2Cum) : "-"}</td>
                        </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </>
              );
            })()}
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
            <p className="text-xs sm:text-sm text-muted">Earnings for each golfer by event. Completed tournaments show actual results; upcoming events show the projected payout structure.</p>
            {tournaments.map(t => {
              const trData = tournamentResults.find(r => r.tournamentId === t.id);
              const hasResults = trData && trData.results.length > 0;
              return (
                <div key={t.id} className="bg-surface rounded-xl border border-border overflow-hidden">
                  <div className="bg-surface-alt px-4 sm:px-6 py-3 border-b border-border flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                    <div>
                      <h3 className="font-bold text-sm sm:text-base">{t.name}</h3>
                      <p className="text-xs sm:text-sm text-muted">{formatPurse(t.purse)} total purse</p>
                    </div>
                    {hasResults && <span className="text-xs bg-success/10 text-success px-2 py-0.5 rounded-full font-medium">Results In</span>}
                  </div>
                  <div className="px-4 sm:px-6 py-4">
                    {hasResults ? (
                      <div className="space-y-0">
                        <div className="grid grid-cols-[2rem_1fr_4rem_5rem] sm:grid-cols-[2.5rem_1fr_5rem_6rem] gap-x-2 text-xs font-semibold text-muted border-b border-border pb-2 mb-1">
                          <span>Pos</span><span>Golfer</span><span className="text-right">Score</span><span className="text-right">Earnings</span>
                        </div>
                        {trData.results.slice(0, 30).map((r, i) => (
                          <div key={i} className={`grid grid-cols-[2rem_1fr_4rem_5rem] sm:grid-cols-[2.5rem_1fr_5rem_6rem] gap-x-2 text-xs sm:text-sm py-1.5 border-b border-border/30 ${i < 3 ? "font-semibold" : ""}`}>
                            <span className={i === 0 ? "text-accent font-bold" : "text-muted"}>{r.position || "-"}</span>
                            <span className={`truncate ${i === 0 ? "text-accent" : ""}`}>{r.golferName}</span>
                            <span className="text-right text-muted">{r.score || "-"}</span>
                            <span className={`text-right font-medium ${r.prizeMoney > 0 ? (i === 0 ? "text-accent font-bold" : "text-foreground") : "text-muted"}`}>{r.prizeMoney > 0 ? formatMoney(r.prizeMoney) : "-"}</span>
                          </div>
                        ))}
                        {trData.results.length > 30 && (
                          <p className="text-xs text-muted pt-2">+ {trData.results.length - 30} more golfers</p>
                        )}
                      </div>
                    ) : (
                      <div>
                        <p className="text-xs text-muted mb-3">Projected payout by position</p>
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-x-6 gap-y-1 text-xs sm:text-sm">
                          {(t.payouts || []).slice(0, 30).map(p => (
                            <div key={p.position} className="flex justify-between py-1 border-b border-border/50">
                              <span className={`${p.position <= 3 ? "font-bold" : ""} ${p.position === 1 ? "text-accent" : ""}`}>{ordinal(p.position)}</span>
                              <span className={`font-medium ${p.position === 1 ? "text-accent font-bold" : ""}`}>{formatMoney(p.prizeMoney)}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
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
