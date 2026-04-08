"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Suspense } from "react";

function InviteContent() {
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();
  const leagueId = params.leagueId as string;
  const code = searchParams.get("code");

  const [leagueName, setLeagueName] = useState("");
  const [error, setError] = useState("");
  const [joining, setJoining] = useState(false);
  const [joined, setJoined] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!code) { setError("Invalid invite link"); setLoading(false); return; }
    fetch(`/api/leagues/${leagueId}/invite?code=${code}`)
      .then(r => r.json())
      .then(d => {
        if (d.error) setError(d.error);
        else setLeagueName(d.leagueName);
      })
      .catch(() => setError("Invalid invite link"))
      .finally(() => setLoading(false));
  }, [leagueId, code]);

  async function handleJoin() {
    setJoining(true); setError("");
    try {
      const res = await fetch(`/api/leagues/${leagueId}/invite`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 401) { router.push(`/login?redirect=/leagues/${leagueId}/invite?code=${code}`); return; }
        setError(data.error); return;
      }
      setJoined(true);
      setTimeout(() => router.push(`/leagues/${leagueId}`), 1500);
    } catch { setError("Failed to join"); }
    finally { setJoining(false); }
  }

  if (loading) return <div className="flex flex-1 items-center justify-center min-h-screen"><div className="text-muted">Loading...</div></div>;

  return (
    <div className="flex flex-1 items-center justify-center px-4 min-h-screen">
      <div className="w-full max-w-md text-center">
        <div className="text-5xl mb-4">&#9971;</div>
        <h1 className="text-3xl font-bold mb-2">League Invite</h1>

        {error ? (
          <div className="bg-surface rounded-xl p-8 border border-border mt-6">
            <p className="text-danger mb-4">{error}</p>
            <Link href="/dashboard" className="text-primary font-medium hover:underline">Go to Dashboard</Link>
          </div>
        ) : joined ? (
          <div className="bg-surface rounded-xl p-8 border border-border mt-6">
            <p className="text-success text-lg font-semibold mb-2">You&apos;re in!</p>
            <p className="text-muted">Joined <strong>{leagueName}</strong>. Redirecting...</p>
          </div>
        ) : (
          <div className="bg-surface rounded-xl p-8 border border-border mt-6">
            <p className="text-muted mb-2">You&apos;ve been invited to join</p>
            <p className="text-2xl font-bold mb-6">{leagueName}</p>
            <button onClick={handleJoin} disabled={joining}
              className="w-full bg-primary hover:bg-primary-light text-white font-semibold py-3 rounded-lg transition-colors disabled:opacity-50 text-lg">
              {joining ? "Joining..." : "Join League"}
            </button>
            <p className="text-xs text-muted mt-4">
              Don&apos;t have an account? <Link href={`/register`} className="text-primary hover:underline">Sign up first</Link>
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

export default function InvitePage() {
  return (
    <Suspense fallback={<div className="flex flex-1 items-center justify-center min-h-screen"><div className="text-muted">Loading...</div></div>}>
      <InviteContent />
    </Suspense>
  );
}
