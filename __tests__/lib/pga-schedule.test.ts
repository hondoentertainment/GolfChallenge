import {
  PGA_SCHEDULE_2025_2026,
  PGA_GOLFERS,
  calculatePrizeMoney,
  getTournamentPayouts,
  getPickDeadline,
  getPickDeadlineDisplay,
  PRIZE_PAYOUT_PERCENTAGES,
} from '@/lib/pga-schedule';

describe('PGA Schedule', () => {
  test('has 9 tournaments (Masters through U.S. Open, Zurich excluded)', () => {
    expect(PGA_SCHEDULE_2025_2026).toHaveLength(9);
  });

  test('starts with Masters Tournament', () => {
    expect(PGA_SCHEDULE_2025_2026[0].name).toBe('Masters Tournament');
  });

  test('ends with U.S. Open', () => {
    expect(PGA_SCHEDULE_2025_2026[PGA_SCHEDULE_2025_2026.length - 1].name).toBe('U.S. Open');
  });

  test('includes both majors in range', () => {
    const names = PGA_SCHEDULE_2025_2026.map(t => t.name);
    expect(names).toContain('Masters Tournament');
    expect(names).toContain('PGA Championship');
    expect(names).toContain('U.S. Open');
  });

  test('includes Signature Events in range', () => {
    const names = PGA_SCHEDULE_2025_2026.map(t => t.name);
    expect(names).toContain('RBC Heritage');
    expect(names).toContain('Cadillac Championship');
    expect(names).toContain('Truist Championship');
    expect(names).toContain('The Memorial Tournament');
  });

  test('does not include Zurich Classic', () => {
    const names = PGA_SCHEDULE_2025_2026.map(t => t.name);
    expect(names).not.toContain('Zurich Classic');
    expect(names).not.toContain('Zurich Classic of New Orleans');
  });

  test('all tournaments have valid purse amounts', () => {
    for (const t of PGA_SCHEDULE_2025_2026) {
      expect(t.purse).toBeGreaterThan(0);
      expect(t.purse).toBeLessThanOrEqual(100000000);
    }
  });

  test('all tournaments have chronological dates', () => {
    for (let i = 1; i < PGA_SCHEDULE_2025_2026.length; i++) {
      const prev = new Date(PGA_SCHEDULE_2025_2026[i - 1].startDate);
      const curr = new Date(PGA_SCHEDULE_2025_2026[i].startDate);
      expect(curr.getTime()).toBeGreaterThan(prev.getTime());
    }
  });

  test('each tournament start date is before end date', () => {
    for (const t of PGA_SCHEDULE_2025_2026) {
      expect(new Date(t.endDate).getTime()).toBeGreaterThan(new Date(t.startDate).getTime());
    }
  });

  test('tournament names are unique', () => {
    const names = PGA_SCHEDULE_2025_2026.map(t => t.name);
    expect(new Set(names).size).toBe(names.length);
  });
});

describe('PGA Golfers - No Duplicates', () => {
  test('has at least 150 golfers', () => {
    expect(PGA_GOLFERS.length).toBeGreaterThanOrEqual(150);
  });

  test('NO DUPLICATE NAMES in golfer list', () => {
    const names = PGA_GOLFERS.map(g => g.name.toLowerCase());
    const seen = new Set<string>();
    const duplicates: string[] = [];
    for (const name of names) {
      if (seen.has(name)) {
        duplicates.push(name);
      }
      seen.add(name);
    }
    expect(duplicates).toEqual([]);
    expect(new Set(names).size).toBe(names.length);
  });

  test('all golfer names are unique (case-insensitive)', () => {
    const lowerNames = PGA_GOLFERS.map(g => g.name.toLowerCase());
    const uniqueNames = new Set(lowerNames);
    expect(uniqueNames.size).toBe(PGA_GOLFERS.length);
  });

  test('world rankings are unique', () => {
    const rankings = PGA_GOLFERS.map(g => g.worldRanking);
    const uniqueRankings = new Set(rankings);
    // Rankings should be unique
    expect(uniqueRankings.size).toBe(rankings.length);
  });

  test('world rankings are contiguous from 1', () => {
    const sorted = [...PGA_GOLFERS].sort((a, b) => a.worldRanking - b.worldRanking);
    expect(sorted[0].worldRanking).toBe(1);
    for (let i = 1; i < sorted.length; i++) {
      expect(sorted[i].worldRanking).toBe(sorted[i - 1].worldRanking + 1);
    }
  });

  test('golfer #1 is Scottie Scheffler', () => {
    expect(PGA_GOLFERS[0].name).toBe('Scottie Scheffler');
    expect(PGA_GOLFERS[0].worldRanking).toBe(1);
  });

  test('all golfers have required fields', () => {
    for (const g of PGA_GOLFERS) {
      expect(g.name).toBeTruthy();
      expect(typeof g.worldRanking).toBe('number');
      expect(g.country).toBeTruthy();
      expect(g.country.length).toBeLessThanOrEqual(3);
    }
  });

  test('includes notable golfers', () => {
    const names = PGA_GOLFERS.map(g => g.name);
    expect(names).toContain('Tiger Woods');
    expect(names).toContain('Rory McIlroy');
    expect(names).toContain('Jordan Spieth');
    expect(names).toContain('Jon Rahm');
    expect(names).toContain('Phil Mickelson');
    expect(names).toContain('Bryson DeChambeau');
  });

  test('seedGolfers dedup filter produces same count as unique names', () => {
    const seen = new Set<string>();
    const uniqueGolfers = PGA_GOLFERS.filter(g => {
      if (seen.has(g.name)) return false;
      seen.add(g.name);
      return true;
    });
    // After removing dupes from source, these should be equal
    expect(uniqueGolfers.length).toBe(PGA_GOLFERS.length);
  });
});

describe('Prize Money Calculations', () => {
  test('winner gets 18% of purse', () => {
    expect(calculatePrizeMoney(20000000, 1)).toBe(3600000);
    expect(calculatePrizeMoney(10000000, 1)).toBe(1800000);
  });

  test('2nd place gets 10.9% of purse', () => {
    expect(calculatePrizeMoney(20000000, 2)).toBe(2180000);
  });

  test('position 0 returns 0', () => {
    expect(calculatePrizeMoney(20000000, 0)).toBe(0);
  });

  test('position beyond 65 returns 0', () => {
    expect(calculatePrizeMoney(20000000, 70)).toBe(0);
  });

  test('prize decreases as position increases', () => {
    for (let pos = 1; pos < 60; pos++) {
      const current = calculatePrizeMoney(20000000, pos);
      const next = calculatePrizeMoney(20000000, pos + 1);
      expect(current).toBeGreaterThanOrEqual(next);
    }
  });

  test('payout percentages sum to less than 100%', () => {
    const total = Object.values(PRIZE_PAYOUT_PERCENTAGES).reduce((s, v) => s + v, 0);
    expect(total).toBeLessThan(1);
    expect(total).toBeGreaterThan(0.5);
  });
});

describe('Tournament Payouts', () => {
  test('generates payout table for a tournament', () => {
    const payouts = getTournamentPayouts(20000000);
    expect(payouts.length).toBeGreaterThan(0);
    expect(payouts[0].position).toBe(1);
    expect(payouts[0].prizeMoney).toBe(3600000);
  });

  test('payouts are in descending order', () => {
    const payouts = getTournamentPayouts(20000000);
    for (let i = 1; i < payouts.length; i++) {
      expect(payouts[i].prizeMoney).toBeLessThanOrEqual(payouts[i - 1].prizeMoney);
    }
  });

  test('all tournaments have valid payouts', () => {
    for (const t of PGA_SCHEDULE_2025_2026) {
      const payouts = getTournamentPayouts(t.purse);
      expect(payouts.length).toBeGreaterThan(30);
      expect(payouts[0].prizeMoney).toBe(Math.round(t.purse * 0.18));
    }
  });
});

describe('Pick Deadlines', () => {
  test('Player 1 deadline is Wednesday 6pm PDT', () => {
    const deadline = getPickDeadline(0, '2026-04-09');
    expect(deadline.getUTCHours()).toBe(1);
  });

  test('Player 2 deadline is 2 hours after Player 1', () => {
    const d1 = getPickDeadline(0, '2026-04-09');
    const d2 = getPickDeadline(1, '2026-04-09');
    const diffHours = (d2.getTime() - d1.getTime()) / (1000 * 60 * 60);
    expect(diffHours).toBe(2);
  });

  test('display format is correct', () => {
    expect(getPickDeadlineDisplay(0)).toBe('Wednesday 6:00 PM PDT');
    expect(getPickDeadlineDisplay(1)).toBe('Wednesday 8:00 PM PDT');
  });

  test('deadlines for all 9 tournaments are valid dates', () => {
    for (const t of PGA_SCHEDULE_2025_2026) {
      const d = getPickDeadline(0, t.startDate);
      expect(d.getTime()).toBeGreaterThan(0);
      expect(d.getTime()).toBeLessThan(new Date(t.startDate + 'T23:59:59Z').getTime());
    }
  });
});
