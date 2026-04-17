import { useState, useEffect, useCallback } from 'react';

interface LiveCompetitor {
  name: string;
  position: string;
  score: string;
  today: string;
  thru: string;
}

interface LiveLeaderboard {
  eventName: string;
  status: 'pre' | 'in' | 'post';
  competitors: LiveCompetitor[];
  lastUpdated: Date | null;
}

const ESPN_PGA_URL = 'https://site.api.espn.com/apis/site/v2/sports/golf/pga/scoreboard';
const POLL_INTERVAL_MS = 60_000;

export function useLiveLeaderboard(enabled: boolean): LiveLeaderboard & { loading: boolean } {
  const [data, setData] = useState<LiveLeaderboard>({
    eventName: '',
    status: 'pre',
    competitors: [],
    lastUpdated: null,
  });
  const [loading, setLoading] = useState(false);

  const fetchLeaderboard = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch(ESPN_PGA_URL);
      if (!res.ok) return;
      const json = await res.json();

      const event = json.events?.[0];
      if (!event) return;

      const competition = event.competitions?.[0];
      if (!competition) return;

      const state = event.status?.type?.state as 'pre' | 'in' | 'post';

      const competitors: LiveCompetitor[] = (competition.competitors || [])
        .map((c: { athlete?: { displayName?: string }; status?: { position?: { displayName?: string } }; score?: { displayValue?: string }; linescores?: { value: number }[]; statistics?: { abbreviation: string; displayValue: string }[] }) => ({
          name: c.athlete?.displayName || '',
          position: c.status?.position?.displayName || '',
          score: c.score?.displayValue || '',
          today: c.linescores?.length
            ? String(c.linescores[c.linescores.length - 1]?.value ?? '')
            : '',
          thru: c.statistics?.find((s: { abbreviation: string }) => s.abbreviation === 'THRU')?.displayValue || 'F',
        }))
        .filter((c: LiveCompetitor) => c.name);

      setData({
        eventName: event.name || '',
        status: state,
        competitors,
        lastUpdated: new Date(),
      });
    } catch {
      // Silently fail — live data is optional
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;
    fetchLeaderboard();
    const id = setInterval(fetchLeaderboard, POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [enabled, fetchLeaderboard]);

  return { ...data, loading };
}
