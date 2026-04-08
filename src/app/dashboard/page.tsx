"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

interface User {
  id: string;
  username: string;
  email: string;
  is_admin: boolean;
}

interface League {
  id: string;
  name: string;
  invite_code: string;
  member_count: number;
}

interface Notification {
  id: string;
  type: string;
  title: string;
  body: string;
  read: boolean;
  created_at: string;
}

export default function DashboardPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [leagues, setLeagues] = useState<League[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [showNotifs, setShowNotifs] = useState(false);
  const [joinCode, setJoinCode] = useState("");
  const [joinError, setJoinError] = useState("");
  const [loading, setLoading] = useState(true);

  const loadNotifications = useCallback(async () => {
    try {
      const res = await fetch("/api/notifications");
      if (res.ok) {
        const data = await res.json();
        setNotifications(data.notifications || []);
        setUnreadCount(data.unreadCount || 0);
      }
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    Promise.all([
      fetch("/api/auth/me").then((r) => r.json()),
      fetch("/api/leagues").then((r) => r.json()),
    ])
      .then(([authData, leagueData]) => {
        if (!authData.user) { router.push("/login"); return; }
        setUser(authData.user);
        setLeagues(leagueData.leagues || []);
        loadNotifications();
      })
      .catch(() => router.push("/login"))
      .finally(() => setLoading(false));
  }, [router, loadNotifications]);

  // Poll notifications every 30s
  useEffect(() => {
    if (!user) return;
    const id = setInterval(loadNotifications, 30000);
    return () => clearInterval(id);
  }, [user, loadNotifications]);

  async function handleJoin(e: React.FormEvent) {
    e.preventDefault();
    setJoinError("");
    const res = await fetch("/api/leagues", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ inviteCode: joinCode.toUpperCase() }),
    });
    const data = await res.json();
    if (!res.ok) { setJoinError(data.error); return; }
    router.push(`/leagues/${data.league.id}`);
  }

  async function handleLogout() {
    await fetch("/api/auth/me", { method: "DELETE" });
    router.push("/");
  }

  async function markAllRead() {
    await fetch("/api/notifications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ markAll: true }),
    });
    setNotifications(notifications.map(n => ({ ...n, read: true })));
    setUnreadCount(0);
  }

  if (loading) return <div className="flex flex-1 items-center justify-center"><div className="text-muted">Loading...</div></div>;

  return (
    <div className="min-h-screen">
      <nav className="bg-primary text-white px-4 sm:px-6 py-4">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <Link href="/dashboard" className="text-lg sm:text-xl font-bold flex items-center gap-2">
            <span>&#9971;</span> <span className="hidden sm:inline">Golf Challenge</span>
          </Link>
          <div className="flex items-center gap-2 sm:gap-4">
            {user?.is_admin && (
              <Link href="/admin/results" className="text-xs bg-accent/20 hover:bg-accent/30 px-2 py-1 rounded text-accent-light">
                Admin
              </Link>
            )}
            <button onClick={() => setShowNotifs(!showNotifs)} className="relative text-sm bg-white/10 hover:bg-white/20 px-2.5 py-1.5 rounded-lg">
              &#128276;
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 bg-danger text-white text-[10px] w-4 h-4 rounded-full flex items-center justify-center">
                  {unreadCount}
                </span>
              )}
            </button>
            <span className="text-green-200 text-sm hidden sm:inline">{user?.username}</span>
            <button onClick={handleLogout} className="text-sm bg-white/10 hover:bg-white/20 px-3 py-1.5 rounded-lg">
              Sign Out
            </button>
          </div>
        </div>
      </nav>

      {/* Notifications dropdown */}
      {showNotifs && (
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="bg-surface rounded-b-xl border border-border border-t-0 p-4 shadow-lg max-h-64 overflow-y-auto">
            <div className="flex justify-between items-center mb-2">
              <h3 className="font-semibold text-sm">Notifications</h3>
              {unreadCount > 0 && (
                <button onClick={markAllRead} className="text-xs text-primary hover:underline">Mark all read</button>
              )}
            </div>
            {notifications.length === 0 ? (
              <p className="text-muted text-sm">No notifications yet</p>
            ) : (
              <div className="space-y-2">
                {notifications.slice(0, 10).map(n => (
                  <div key={n.id} className={`text-sm p-2 rounded ${n.read ? "bg-surface-alt" : "bg-primary/5 border-l-2 border-primary"}`}>
                    <p className="font-medium">{n.title}</p>
                    <p className="text-muted text-xs">{n.body}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-8">
          <h1 className="text-2xl sm:text-3xl font-bold">Your Leagues</h1>
          <Link href="/leagues/create"
            className="bg-primary hover:bg-primary-light text-white font-semibold px-5 py-2.5 rounded-lg transition-colors text-sm sm:text-base">
            + Create League
          </Link>
        </div>

        <div className="bg-surface rounded-xl p-4 sm:p-6 border border-border mb-8">
          <h2 className="text-lg font-semibold mb-3">Join a League</h2>
          <form onSubmit={handleJoin} className="flex gap-3">
            <input type="text" value={joinCode} onChange={(e) => setJoinCode(e.target.value)}
              placeholder="Invite code" maxLength={6} required
              className="flex-1 max-w-xs px-4 py-2 rounded-lg border border-border bg-background uppercase tracking-widest font-mono focus:outline-none focus:ring-2 focus:ring-primary"/>
            <button type="submit" className="bg-accent hover:bg-accent-light text-primary-dark font-semibold px-5 py-2 rounded-lg">Join</button>
          </form>
          {joinError && <p className="text-danger text-sm mt-2">{joinError}</p>}
        </div>

        {leagues.length === 0 ? (
          <div className="text-center py-16 bg-surface rounded-xl border border-border">
            <div className="text-5xl mb-4">&#127948;&#65039;</div>
            <h3 className="text-xl font-semibold mb-2">No leagues yet</h3>
            <p className="text-muted mb-6">Create a league or join one with an invite code.</p>
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {leagues.map((league) => (
              <Link key={league.id} href={`/leagues/${league.id}`}
                className="bg-surface rounded-xl p-5 sm:p-6 border border-border hover:border-primary transition-colors group">
                <h3 className="text-lg font-bold group-hover:text-primary">{league.name}</h3>
                <div className="flex items-center gap-4 mt-3 text-sm text-muted">
                  <span>{league.member_count} player{league.member_count !== 1 ? "s" : ""}</span>
                  <span className="font-mono bg-surface-alt px-2 py-0.5 rounded">{league.invite_code}</span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
