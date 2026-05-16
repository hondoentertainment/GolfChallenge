import {
  normalizePublishedGolferName,
  CHALLENGE_PUBLISHED_PAYOUT_BY_TOURNAMENT,
} from '@/lib/challenge-published-payouts-2026';

describe('challenge published payouts', () => {
  test('name aliases resolve to DB spellings', () => {
    expect(normalizePublishedGolferName('Ludvig Aberg')).toBe('Ludvig Åberg');
    expect(normalizePublishedGolferName('Nicolai Hojgaard')).toBe('Nicolai Højgaard');
    expect(normalizePublishedGolferName('Scottie Scheffler')).toBe('Scottie Scheffler');
  });

  test('no duplicate normalized golfer keys within a tournament table', () => {
    for (const [tournament, rec] of Object.entries(CHALLENGE_PUBLISHED_PAYOUT_BY_TOURNAMENT)) {
      const normalized = Object.keys(rec).map((k) => normalizePublishedGolferName(k));
      const seen = new Set<string>();
      const duplicates: string[] = [];
      for (const n of normalized) {
        if (seen.has(n)) duplicates.push(n);
        seen.add(n);
      }
      expect({ tournament, duplicates }).toEqual({ tournament, duplicates: [] });
    }
  });
});
