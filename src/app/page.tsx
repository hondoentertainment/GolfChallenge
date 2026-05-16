"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

type RecapPayload = {
  recap: {
    tournament: { name: string; course: string; purse: number };
    results: { golfer_name: string; position: string; prize_money: number }[];
  } | null;
  upcoming: { name: string; start_date: string; course: string } | null;
  noRecapReason?: 'no_completed_events_with_results' | 'tournament_not_found' | 'empty_leaderboard' | null;
};

function RecapSection() {
  const [payload, setPayload] = useState<RecapPayload | null>(null);
  const [loadState, setLoadState] = useState<'loading' | 'ok' | 'error'>('loading');

  useEffect(() => {
    fetch('/api/public/recap')
      .then((r) => {
        if (!r.ok) throw new Error('bad response');
        return r.json();
      })
      .then((data: RecapPayload) => {
        setPayload(data);
        setLoadState('ok');
      })
      .catch(() => setLoadState('error'));
  }, []);

  if (loadState === 'loading') {
    return (
      <section className="max-w-6xl mx-auto px-6 py-16" aria-busy="true">
        <h2 className="text-3xl font-bold text-center mb-8">Recent Results</h2>
        <div className="bg-surface rounded-xl p-10 border border-border text-center text-muted text-sm">
          Loading tournament highlights…
        </div>
      </section>
    );
  }

  if (loadState === 'error' || !payload) {
    return (
      <section className="max-w-6xl mx-auto px-6 py-16">
        <h2 className="text-3xl font-bold text-center mb-8">Recent Results</h2>
        <div className="bg-surface rounded-xl p-8 border border-border text-center text-muted text-sm">
          Highlights are temporarily unavailable. Try again in a moment.
        </div>
      </section>
    );
  }

  const { recap, upcoming, noRecapReason } = payload;

  if (!recap) {
    return (
      <section className="max-w-6xl mx-auto px-6 py-16">
        <h2 className="text-3xl font-bold text-center mb-8">Recent Results</h2>
        <div className="bg-surface rounded-xl p-8 border border-border text-center space-y-4">
          <p className="text-muted text-sm max-w-lg mx-auto">
            {noRecapReason === 'no_completed_events_with_results'
              ? 'No finished tournaments with results yet. Check back after the first event wraps up.'
              : 'No recap is available right now.'}
          </p>
          {upcoming && (
            <p className="text-sm text-muted">
              Up next:{' '}
              <strong className="text-foreground">{upcoming.name}</strong> at {upcoming.course}
            </p>
          )}
        </div>
      </section>
    );
  }

  const { tournament, results } = recap;

  return (
    <section className="max-w-6xl mx-auto px-6 py-16">
      <h2 className="text-3xl font-bold text-center mb-8">Last Week&apos;s Results</h2>
      <div className="bg-surface rounded-xl p-8 border border-border">
        <h3 className="text-xl font-bold mb-1">{tournament.name}</h3>
        <p className="text-muted text-sm mb-4">{tournament.course}</p>
        {results.length === 0 ? (
          <p className="text-sm text-muted text-center py-6">
            Leaderboard data is not available for this event yet. Results may still be syncing.
          </p>
        ) : (
          <div className="space-y-2">
            {results.slice(0, 5).map((r, i) => (
              <div
                key={`${r.golfer_name}-${i}`}
                className="flex items-center justify-between px-4 py-2 rounded-lg bg-surface-alt"
              >
                <div className="flex items-center gap-3">
                  <span className={`font-bold ${i === 0 ? 'text-accent text-lg' : 'text-muted'}`}>
                    {r.position}
                  </span>
                  <span className="font-medium">{r.golfer_name}</span>
                </div>
                <span className={`font-bold ${i === 0 ? 'text-accent' : ''}`}>
                  {r.prize_money > 0 ? '$' + r.prize_money.toLocaleString() : ''}
                </span>
              </div>
            ))}
          </div>
        )}
        {upcoming && (
          <div className="mt-6 pt-4 border-t border-border text-center">
            <p className="text-sm text-muted">
              Up next: <strong className="text-foreground">{upcoming.name}</strong> at {upcoming.course}
            </p>
          </div>
        )}
      </div>
    </section>
  );
}

export default function Home() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((res) => {
        if (res.ok) {
          router.push("/dashboard");
        } else {
          setChecking(false);
        }
      })
      .catch(() => setChecking(false));
  }, [router]);

  if (checking) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <div className="text-muted">Loading...</div>
      </div>
    );
  }

  return (
    <div className="flex flex-col flex-1">
      {/* Hero */}
      <header className="bg-primary text-white">
        <div className="max-w-6xl mx-auto px-6 py-20 text-center">
          <div className="text-5xl mb-4">&#9971;</div>
          <h1 className="text-5xl font-bold mb-4 tracking-tight">
            Golf Challenge
          </h1>
          <p className="text-xl text-green-100 max-w-2xl mx-auto mb-8">
            Go head-to-head with friends. Pick a PGA Tour golfer each week and
            win their tournament prize money. Rotate picks. Dominate the
            leaderboard.
          </p>
          <div className="flex gap-4 justify-center">
            <Link
              href="/register"
              className="bg-accent hover:bg-accent-light text-primary-dark font-bold px-8 py-3 rounded-lg text-lg transition-colors"
            >
              Get Started
            </Link>
            <Link
              href="/login"
              className="border-2 border-white/30 hover:border-white/60 text-white font-semibold px-8 py-3 rounded-lg text-lg transition-colors"
            >
              Sign In
            </Link>
          </div>
        </div>
      </header>

      {/* How it works */}
      <section className="max-w-6xl mx-auto px-6 py-16">
        <h2 className="text-3xl font-bold text-center mb-12">How It Works</h2>
        <div className="grid md:grid-cols-3 gap-8">
          <div className="bg-surface rounded-xl p-8 border border-border text-center">
            <div className="text-4xl mb-4">&#127942;</div>
            <h3 className="text-xl font-bold mb-2">Create a League</h3>
            <p className="text-muted">
              Start a league and invite friends with a simple invite code. Head-to-head competition at its best.
            </p>
          </div>
          <div className="bg-surface rounded-xl p-8 border border-border text-center">
            <div className="text-4xl mb-4">&#127948;&#65039;</div>
            <h3 className="text-xl font-bold mb-2">Pick Your Golfer</h3>
            <p className="text-muted">
              Each Wednesday, players take turns picking a golfer for that week&apos;s PGA Tour event. Player 1 picks by 6 PM PDT, Player 2 by 8 PM PDT.
            </p>
          </div>
          <div className="bg-surface rounded-xl p-8 border border-border text-center">
            <div className="text-4xl mb-4">&#128176;</div>
            <h3 className="text-xl font-bold mb-2">Win Prize Money</h3>
            <p className="text-muted">
              Your golfer&apos;s tournament prize money becomes your score. The player with the most earnings at season&apos;s end wins.
            </p>
          </div>
        </div>
      </section>

      {/* Rules */}
      <section className="bg-surface-alt py-16">
        <div className="max-w-4xl mx-auto px-6">
          <h2 className="text-3xl font-bold text-center mb-8">Rules</h2>
          <div className="bg-surface rounded-xl p-8 border border-border space-y-4">
            <div className="flex gap-3">
              <span className="text-primary font-bold min-w-8">1.</span>
              <p>Runs from the <strong>Masters</strong> through the <strong>U.S. Open</strong> (10 tournaments, Zurich Classic excluded).</p>
            </div>
            <div className="flex gap-3">
              <span className="text-primary font-bold min-w-8">2.</span>
              <p>Player 1 must select their golfer by <strong>Wednesday 6:00 PM PDT</strong>.</p>
            </div>
            <div className="flex gap-3">
              <span className="text-primary font-bold min-w-8">3.</span>
              <p>Player 2 must select their golfer by <strong>Wednesday 8:00 PM PDT</strong>.</p>
            </div>
            <div className="flex gap-3">
              <span className="text-primary font-bold min-w-8">4.</span>
              <p>The pick order rotates each week so everyone gets a fair shot.</p>
            </div>
            <div className="flex gap-3">
              <span className="text-primary font-bold min-w-8">5.</span>
              <p><strong>You cannot pick the same golfer more than once.</strong> Choose wisely each week.</p>
            </div>
            <div className="flex gap-3">
              <span className="text-primary font-bold min-w-8">6.</span>
              <p>No two players in the same league can pick the same golfer for the same tournament.</p>
            </div>
            <div className="flex gap-3">
              <span className="text-primary font-bold min-w-8">7.</span>
              <p>Your golfer&apos;s official tournament prize money counts as your score for that week (winner gets 18% of purse).</p>
            </div>
            <div className="flex gap-3">
              <span className="text-primary font-bold min-w-8">8.</span>
              <p>Total prize money accumulated across all tournaments determines the winner.</p>
            </div>
          </div>
        </div>
      </section>

      {/* Last Week Recap */}
      <RecapSection />

      {/* Footer */}
      <footer className="bg-primary-dark text-green-200 py-8">
        <div className="max-w-6xl mx-auto px-6 text-center">
          <p className="text-sm">Golf Challenge &copy; {new Date().getFullYear()} &mdash; PGA Tour schedule for illustrative purposes</p>
        </div>
      </footer>
    </div>
  );
}
