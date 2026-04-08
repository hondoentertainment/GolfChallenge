"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";

interface User {
  id: string;
  username: string;
}

interface League {
  id: string;
  name: string;
  invite_code: string;
}

interface Member {
  user_id: string;
  username: string;
}

interface Payout {
  position: number;
  prizeMoney: number;
}

interface Tournament {
  id: string;
  name: string;
  start_date: string;
  end_date: string;
  course: string;
  location: string;
  purse: number;
  payouts?: Payout[];
}

interface Golfer {
  id: string;
  name: string;
  world_ranking: number;
  country: string;
}

interface PickDetail {
  id: string;
  user_id: string;
  username: string;
  golfer_name: string;
  tournament_name: string;
  prize_money: number;
  golfer_id: string;
}

interface PickOrderEntry {
  userId: string;
  username: string;
  position: number;
  deadline: string;
}

interface Standing {
  userId: string;
  username: string;
  totalPrizeMoney: number;
  pickCount: number;
}

function formatMoney(amount: number): string {
  if (amount >= 1000000) {
    return "$" + (amount / 1000000).toFixed(2) + "M";
  }
  return "$" + amount.toLocaleString("en-US");
}

function formatPurse(amount: number): string {
  if (amount >= 1000000) {
    return "$" + (amount / 1000000).toFixed(0) + "M";
  }
  return "$" + amount.toLocaleString();
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr + "T12:00:00");
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

export default function LeaguePage() {
  const router = useRouter();
  const params = useParams();
  const leagueId = params.leagueId as string;

  const [user, setUser] = useState<User | null>(null);
  const [league, setLeague] = useState<League | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [currentTournament, setCurrentTournament] = useState<Tournament | null>(null);
  const [selectedTournament, setSelectedTournament] = useState<string>("");
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
  const [tab, setTab] = useState<"pick" | "standings" | "schedule" | "payouts">("pick");
  const [loading, setLoading] = useState(true);
  const [golferSearch, setGolferSearch] = useState("");
  const [copiedCode, setCopiedCode] = useState(false);

  const loadPickData = useCallback(async (tournamentId: string) => {
    const res = await fetch(`/api/leagues/${leagueId}/picks?tournamentId=${tournamentId}`);
    const data = await res.json();
    setPicks(data.picks || []);
    setPickOrder(data.pickOrder || []);
    setCanPick(data.userCanPick);
    setUsedGolfers(data.usedGolfers || []);
  }, [leagueId]);

  useEffect(() => {
    async function load() {
      try {
        const [authRes, leagueRes, tournamentRes, golferRes, standingsRes, allPicksRes] = await Promise.all([
          fetch("/api/auth/me").then((r) => r.json()),
          fetch(`/api/leagues/${leagueId}`).then((r) => r.json()),
          fetch(`/api/leagues/${leagueId}/tournaments`).then((r) => r.json()),
          fetch("/api/tournaments").then((r) => r.json()),
          fetch(`/api/leagues/${leagueId}/standings`).then((r) => r.json()),
          fetch(`/api/leagues/${leagueId}/picks`).then((r) => r.json()),
        ]);

        if (!authRes.user) {
          router.push("/login");
          return;
        }

        setUser(authRes.user);
        setLeague(leagueRes.league);
        setMembers(leagueRes.members || []);
        setTournaments(golferRes.tournaments || []);
        setCurrentTournament(tournamentRes.currentTournament);
        setGolfers(golferRes.golfers || []);
        setStandings(standingsRes.standings || []);
        setAllPicks(allPicksRes.picks || []);

        const activeTournament = tournamentRes.currentTournament;
        if (activeTournament) {
          setSelectedTournament(activeTournament.id);
          await loadPickData(activeTournament.id);
        }
      } catch {
        router.push("/dashboard");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [leagueId, router, loadPickData]);

  async function handleTournamentChange(tournamentId: string) {
    setSelectedTournament(tournamentId);
    setSelectedGolfer("");
    setPickError("");
    await loadPickData(tournamentId);
  }

  async function handleMakePick() {
    if (!selectedGolfer || !selectedTournament) return;
    setPickError("");
    setPickLoading(true);

    try {
      const res = await fetch(`/api/leagues/${leagueId}/picks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tournamentId: selectedTournament,
          golferId: selectedGolfer,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setPickError(data.error);
        return;
      }

      await loadPickData(selectedTournament);
      const [standingsRes, allPicksRes] = await Promise.all([
        fetch(`/api/leagues/${leagueId}/standings`).then((r) => r.json()),
        fetch(`/api/leagues/${leagueId}/picks`).then((r) => r.json()),
      ]);
      setStandings(standingsRes.standings || []);
      setAllPicks(allPicksRes.picks || []);
      setSelectedGolfer("");
    } catch {
      setPickError("Failed to submit pick");
    } finally {
      setPickLoading(false);
    }
  }

  function copyInviteCode() {
    if (league) {
      navigator.clipboard.writeText(league.invite_code);
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 2000);
    }
  }

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center min-h-screen">
        <div className="text-muted">Loading league...</div>
      </div>
    );
  }

  const pickedGolferIds = picks.map((p) => p.golfer_id);
  const filteredGolfers = golfers.filter((g) =>
    g.name.toLowerCase().includes(golferSearch.toLowerCase())
  );

  const selectedTournamentData = tournaments.find((t) => t.id === selectedTournament);

  // Group all picks by tournament for the standings detail view
  const picksByTournament = new Map<string, PickDetail[]>();
  for (const p of allPicks) {
    const list = picksByTournament.get(p.tournament_name) || [];
    list.push(p);
    picksByTournament.set(p.tournament_name, list);
  }

  return (
    <div className="min-h-screen">
      {/* Nav */}
      <nav className="bg-primary text-white px-6 py-4">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/dashboard" className="text-xl font-bold flex items-center gap-2">
              <span>&#9971;</span> Golf Challenge
            </Link>
            <span className="text-green-200">/</span>
            <span className="font-medium">{league?.name}</span>
          </div>
          <span className="text-green-200 text-sm">{user?.username}</span>
        </div>
      </nav>

      <div className="max-w-6xl mx-auto px-6 py-8">
        {/* League header */}
        <div className="bg-surface rounded-xl p-6 border border-border mb-6 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">{league?.name}</h1>
            <p className="text-muted text-sm mt-1">
              Masters &rarr; U.S. Open &middot; {members.length} player{members.length !== 1 ? "s" : ""} &mdash;{" "}
              {members.map((m) => m.username).join(", ")}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted">Invite code:</span>
            <button
              onClick={copyInviteCode}
              className="font-mono bg-surface-alt px-3 py-1.5 rounded-lg border border-border hover:border-primary transition-colors text-sm"
            >
              {copiedCode ? "Copied!" : league?.invite_code}
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-6 bg-surface-alt rounded-lg p-1 w-fit">
          {(["pick", "standings", "schedule", "payouts"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-5 py-2 rounded-md text-sm font-medium transition-colors ${
                tab === t
                  ? "bg-primary text-white"
                  : "text-muted hover:text-foreground"
              }`}
            >
              {t === "pick" ? "Make Pick" : t === "standings" ? "Standings" : t === "payouts" ? "Prize Payouts" : "Schedule"}
            </button>
          ))}
        </div>

        {/* Pick tab */}
        {tab === "pick" && (
          <div className="space-y-6">
            {/* Tournament selector */}
            <div className="bg-surface rounded-xl p-6 border border-border">
              <label className="block text-sm font-medium mb-2">Tournament</label>
              <select
                value={selectedTournament}
                onChange={(e) => handleTournamentChange(e.target.value)}
                className="w-full max-w-md px-4 py-2 rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary"
              >
                <option value="">Select tournament...</option>
                {tournaments.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} ({formatDate(t.start_date)} - {formatDate(t.end_date)})
                    {currentTournament?.id === t.id ? " \u2190 Current" : ""}
                  </option>
                ))}
              </select>

              {selectedTournamentData && (
                <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted">
                  <span>{selectedTournamentData.course}</span>
                  <span>{selectedTournamentData.location}</span>
                  <span className="font-semibold text-accent">{formatPurse(selectedTournamentData.purse)} purse</span>
                  {selectedTournamentData.payouts && (
                    <span className="text-primary font-medium">
                      Winner: {formatMoney(selectedTournamentData.payouts[0]?.prizeMoney || 0)}
                    </span>
                  )}
                </div>
              )}
            </div>

            {/* Pick order */}
            {selectedTournament && pickOrder.length > 0 && (
              <div className="bg-surface rounded-xl p-6 border border-border">
                <h3 className="font-semibold mb-3">Pick Order This Week</h3>
                <div className="space-y-2">
                  {pickOrder.map((po) => {
                    const hasPicked = picks.some((p) => p.user_id === po.userId);
                    const isCurrentUser = po.userId === user?.id;
                    const deadline = new Date(po.deadline);
                    const deadlineStr =
                      deadline.toLocaleString("en-US", {
                        timeZone: "America/Los_Angeles",
                        weekday: "short",
                        hour: "numeric",
                        minute: "2-digit",
                      }) + " PDT";

                    return (
                      <div
                        key={po.userId}
                        className={`flex items-center justify-between px-4 py-2 rounded-lg ${
                          isCurrentUser ? "bg-primary/10 border border-primary/20" : "bg-surface-alt"
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <span className="w-7 h-7 rounded-full bg-primary text-white text-sm flex items-center justify-center font-bold">
                            {po.position + 1}
                          </span>
                          <span className={`font-medium ${isCurrentUser ? "text-primary" : ""}`}>
                            {po.username}
                            {isCurrentUser ? " (you)" : ""}
                          </span>
                        </div>
                        <div className="text-sm">
                          {hasPicked ? (
                            <span className="text-success font-medium">&#10003; Picked</span>
                          ) : (
                            <span className="text-muted">by {deadlineStr}</span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Current picks for this tournament */}
            {selectedTournament && picks.length > 0 && (
              <div className="bg-surface rounded-xl p-6 border border-border">
                <h3 className="font-semibold mb-3">Picks This Week</h3>
                <div className="space-y-2">
                  {picks.map((p) => (
                    <div
                      key={p.id}
                      className="flex items-center justify-between px-4 py-3 rounded-lg bg-surface-alt"
                    >
                      <div>
                        <span className="font-medium">{p.username}</span>
                        <span className="mx-2 text-muted">&rarr;</span>
                        <span className="font-semibold text-primary">{p.golfer_name}</span>
                      </div>
                      <div className="text-right">
                        {p.prize_money > 0 ? (
                          <span className="text-accent font-bold text-lg">{formatMoney(p.prize_money)}</span>
                        ) : (
                          <span className="text-muted text-sm">Awaiting results</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Make pick form */}
            {selectedTournament && canPick && (
              <div className="bg-surface rounded-xl p-6 border border-border">
                {canPick.canPick ? (
                  <>
                    <h3 className="font-semibold mb-1">Select Your Golfer</h3>
                    <p className="text-sm text-muted mb-4">
                      Pick one golfer for this tournament. You cannot pick the same golfer more than once.
                    </p>

                    {pickError && (
                      <div className="bg-red-50 text-danger border border-red-200 rounded-lg p-3 text-sm mb-4">
                        {pickError}
                      </div>
                    )}

                    <input
                      type="text"
                      value={golferSearch}
                      onChange={(e) => setGolferSearch(e.target.value)}
                      placeholder="Search golfers..."
                      className="w-full max-w-md px-4 py-2 rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary mb-4"
                    />

                    <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2 max-h-[32rem] overflow-y-auto pr-1">
                      {filteredGolfers.map((g) => {
                        const taken = pickedGolferIds.includes(g.id);
                        const usedThisSeason = usedGolfers.includes(g.id);
                        const isSelected = selectedGolfer === g.id;
                        const disabled = taken || usedThisSeason;

                        return (
                          <button
                            key={g.id}
                            onClick={() => !disabled && setSelectedGolfer(g.id)}
                            disabled={disabled}
                            className={`text-left px-4 py-3 rounded-lg border transition-colors ${
                              isSelected
                                ? "border-primary bg-primary/10 ring-2 ring-primary"
                                : disabled
                                ? "border-border bg-surface-alt opacity-40 cursor-not-allowed"
                                : "border-border hover:border-primary hover:bg-primary/5 cursor-pointer"
                            }`}
                          >
                            <div className="flex items-center justify-between">
                              <span className="font-medium text-sm">{g.name}</span>
                              <span className="text-xs text-muted">#{g.world_ranking}</span>
                            </div>
                            <div className="text-xs text-muted mt-0.5">
                              {g.country}
                              {taken && <span className="text-danger ml-1">&bull; Taken this week</span>}
                              {usedThisSeason && !taken && <span className="text-danger ml-1">&bull; Already used</span>}
                            </div>
                          </button>
                        );
                      })}
                    </div>

                    {selectedGolfer && (
                      <div className="mt-4 flex items-center gap-3">
                        <button
                          onClick={handleMakePick}
                          disabled={pickLoading}
                          className="bg-primary hover:bg-primary-light text-white font-semibold px-6 py-2.5 rounded-lg transition-colors disabled:opacity-50"
                        >
                          {pickLoading ? "Submitting..." : "Lock In Pick"}
                        </button>
                        <span className="text-sm text-muted">
                          Selected:{" "}
                          <span className="font-medium text-foreground">
                            {golfers.find((g) => g.id === selectedGolfer)?.name}
                          </span>
                        </span>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="text-center py-4">
                    <p className="text-muted">{canPick.reason}</p>
                    {canPick.deadline && (
                      <p className="text-sm text-muted mt-1">
                        Your deadline:{" "}
                        {new Date(canPick.deadline).toLocaleString("en-US", {
                          timeZone: "America/Los_Angeles",
                          weekday: "long",
                          hour: "numeric",
                          minute: "2-digit",
                        })}{" "}
                        PDT
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Standings tab */}
        {tab === "standings" && (
          <div className="space-y-6">
            {/* Main leaderboard */}
            <div className="bg-surface rounded-xl border border-border overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="bg-surface-alt border-b border-border">
                    <th className="text-left px-6 py-3 text-sm font-semibold text-muted">Rank</th>
                    <th className="text-left px-6 py-3 text-sm font-semibold text-muted">Player</th>
                    <th className="text-right px-6 py-3 text-sm font-semibold text-muted">Picks</th>
                    <th className="text-right px-6 py-3 text-sm font-semibold text-muted">Total Earnings</th>
                  </tr>
                </thead>
                <tbody>
                  {standings.map((s, i) => (
                    <tr
                      key={s.userId}
                      className={`border-b border-border last:border-0 ${
                        s.userId === user?.id ? "bg-primary/5" : ""
                      }`}
                    >
                      <td className="px-6 py-4">
                        <span className={`font-bold text-lg ${i === 0 ? "text-accent" : ""}`}>
                          {i + 1}
                        </span>
                      </td>
                      <td className="px-6 py-4 font-medium">
                        {s.username}
                        {s.userId === user?.id ? " (you)" : ""}
                      </td>
                      <td className="px-6 py-4 text-right text-muted">{s.pickCount} / {tournaments.length}</td>
                      <td className="px-6 py-4 text-right font-bold text-lg text-accent">
                        {formatMoney(s.totalPrizeMoney)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pick history by tournament */}
            <h3 className="text-lg font-bold">Pick History</h3>
            {tournaments.map((t) => {
              const tournamentPicks = allPicks.filter((p) => p.tournament_name === t.name);
              if (tournamentPicks.length === 0) return null;

              return (
                <div key={t.id} className="bg-surface rounded-xl border border-border p-5">
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <h4 className="font-semibold">{t.name}</h4>
                      <p className="text-xs text-muted">
                        {formatDate(t.start_date)} - {formatDate(t.end_date)} &middot; {formatPurse(t.purse)} purse
                      </p>
                    </div>
                  </div>
                  <div className="space-y-1">
                    {tournamentPicks.map((p) => (
                      <div
                        key={p.id}
                        className="flex items-center justify-between px-3 py-2 rounded bg-surface-alt text-sm"
                      >
                        <div>
                          <span className="font-medium">{p.username}</span>
                          <span className="mx-2 text-muted">&rarr;</span>
                          <span className="text-primary font-medium">{p.golfer_name}</span>
                        </div>
                        <span className={`font-bold ${p.prize_money > 0 ? "text-accent" : "text-muted"}`}>
                          {p.prize_money > 0 ? formatMoney(p.prize_money) : "TBD"}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Schedule tab */}
        {tab === "schedule" && (
          <div className="space-y-3">
            {tournaments.map((t) => {
              const isPast = new Date(t.end_date) < new Date();
              const isCurrent = currentTournament?.id === t.id;

              return (
                <button
                  key={t.id}
                  onClick={() => {
                    setSelectedTournament(t.id);
                    setTab("pick");
                    handleTournamentChange(t.id);
                  }}
                  className={`w-full text-left bg-surface rounded-xl p-5 border transition-colors ${
                    isCurrent
                      ? "border-primary bg-primary/5"
                      : isPast
                      ? "border-border opacity-60"
                      : "border-border hover:border-primary"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold">{t.name}</h3>
                        {isCurrent && (
                          <span className="text-xs bg-primary text-white px-2 py-0.5 rounded-full">
                            Current
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-muted mt-1">
                        {t.course} &middot; {t.location}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-medium">
                        {formatDate(t.start_date)} - {formatDate(t.end_date)}
                      </p>
                      <p className="text-sm text-accent font-semibold">{formatPurse(t.purse)}</p>
                      {t.payouts && (
                        <p className="text-xs text-primary">Winner: {formatMoney(t.payouts[0]?.prizeMoney || 0)}</p>
                      )}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}

        {/* Payouts tab */}
        {tab === "payouts" && (
          <div className="space-y-6">
            <p className="text-sm text-muted">
              Standard PGA Tour payout structure. The winner receives 18% of the purse.
              Your picked golfer&apos;s finishing position determines your prize money for that week.
            </p>

            {tournaments.map((t) => (
              <div key={t.id} className="bg-surface rounded-xl border border-border overflow-hidden">
                <div className="bg-surface-alt px-6 py-3 border-b border-border">
                  <h3 className="font-bold">{t.name}</h3>
                  <p className="text-sm text-muted">{formatPurse(t.purse)} total purse</p>
                </div>
                <div className="px-6 py-4">
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-x-6 gap-y-1 text-sm">
                    {(t.payouts || []).slice(0, 30).map((p) => (
                      <div key={p.position} className="flex justify-between py-1 border-b border-border/50">
                        <span className={`${p.position <= 3 ? "font-bold" : ""} ${p.position === 1 ? "text-accent" : ""}`}>
                          {ordinal(p.position)}
                        </span>
                        <span className={`font-medium ${p.position === 1 ? "text-accent font-bold" : ""}`}>
                          {formatMoney(p.prizeMoney)}
                        </span>
                      </div>
                    ))}
                  </div>
                  {(t.payouts || []).length > 30 && (
                    <p className="text-xs text-muted mt-3">
                      Payouts continue through {ordinal((t.payouts || []).length)} place...
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
