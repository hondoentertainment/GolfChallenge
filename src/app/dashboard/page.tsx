"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

interface User {
  id: string;
  username: string;
  email: string;
}

interface League {
  id: string;
  name: string;
  invite_code: string;
  member_count: number;
}

export default function DashboardPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [leagues, setLeagues] = useState<League[]>([]);
  const [joinCode, setJoinCode] = useState("");
  const [joinError, setJoinError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch("/api/auth/me").then((r) => r.json()),
      fetch("/api/leagues").then((r) => r.json()),
    ])
      .then(([authData, leagueData]) => {
        if (!authData.user) {
          router.push("/login");
          return;
        }
        setUser(authData.user);
        setLeagues(leagueData.leagues || []);
      })
      .catch(() => router.push("/login"))
      .finally(() => setLoading(false));
  }, [router]);

  async function handleJoin(e: React.FormEvent) {
    e.preventDefault();
    setJoinError("");

    const res = await fetch("/api/leagues", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ inviteCode: joinCode.toUpperCase() }),
    });

    const data = await res.json();
    if (!res.ok) {
      setJoinError(data.error);
      return;
    }

    router.push(`/leagues/${data.league.id}`);
  }

  async function handleLogout() {
    await fetch("/api/auth/me", { method: "DELETE" });
    router.push("/");
  }

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <div className="text-muted">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      {/* Nav */}
      <nav className="bg-primary text-white px-6 py-4">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <Link href="/dashboard" className="text-xl font-bold flex items-center gap-2">
            <span>&#9971;</span> Golf Challenge
          </Link>
          <div className="flex items-center gap-4">
            <span className="text-green-200 text-sm">Hey, {user?.username}</span>
            <button
              onClick={handleLogout}
              className="text-sm bg-white/10 hover:bg-white/20 px-3 py-1.5 rounded-lg transition-colors"
            >
              Sign Out
            </button>
          </div>
        </div>
      </nav>

      <div className="max-w-6xl mx-auto px-6 py-8">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-3xl font-bold">Your Leagues</h1>
          <Link
            href="/leagues/create"
            className="bg-primary hover:bg-primary-light text-white font-semibold px-5 py-2.5 rounded-lg transition-colors"
          >
            + Create League
          </Link>
        </div>

        {/* Join league */}
        <div className="bg-surface rounded-xl p-6 border border-border mb-8">
          <h2 className="text-lg font-semibold mb-3">Join a League</h2>
          <form onSubmit={handleJoin} className="flex gap-3">
            <input
              type="text"
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value)}
              placeholder="Enter invite code"
              className="flex-1 max-w-xs px-4 py-2 rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary uppercase tracking-widest font-mono"
              maxLength={6}
              required
            />
            <button
              type="submit"
              className="bg-accent hover:bg-accent-light text-primary-dark font-semibold px-5 py-2 rounded-lg transition-colors"
            >
              Join
            </button>
          </form>
          {joinError && (
            <p className="text-danger text-sm mt-2">{joinError}</p>
          )}
        </div>

        {/* Leagues list */}
        {leagues.length === 0 ? (
          <div className="text-center py-16 bg-surface rounded-xl border border-border">
            <div className="text-5xl mb-4">&#127948;&#65039;</div>
            <h3 className="text-xl font-semibold mb-2">No leagues yet</h3>
            <p className="text-muted mb-6">Create a league or join one with an invite code.</p>
          </div>
        ) : (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {leagues.map((league) => (
              <Link
                key={league.id}
                href={`/leagues/${league.id}`}
                className="bg-surface rounded-xl p-6 border border-border hover:border-primary transition-colors group"
              >
                <h3 className="text-lg font-bold group-hover:text-primary transition-colors">
                  {league.name}
                </h3>
                <div className="flex items-center gap-4 mt-3 text-sm text-muted">
                  <span>{league.member_count} player{league.member_count !== 1 ? "s" : ""}</span>
                  <span className="font-mono bg-surface-alt px-2 py-0.5 rounded">
                    {league.invite_code}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
