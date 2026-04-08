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
  test('has exactly 9 tournaments (Masters through US Open)', () => {
    expect(PGA_SCHEDULE_2025_2026).toHaveLength(9);
  });

  test('starts with Masters Tournament', () => {
    expect(PGA_SCHEDULE_2025_2026[0].name).toBe('Masters Tournament');
  });

  test('ends with U.S. Open', () => {
    expect(PGA_SCHEDULE_2025_2026[PGA_SCHEDULE_2025_2026.length - 1].name).toBe('U.S. Open');
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
});

describe('PGA Golfers', () => {
  test('has at least 150 golfers', () => {
    expect(PGA_GOLFERS.length).toBeGreaterThanOrEqual(150);
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

  test('world rankings are positive integers', () => {
    for (const g of PGA_GOLFERS) {
      expect(g.worldRanking).toBeGreaterThan(0);
      expect(Number.isInteger(g.worldRanking)).toBe(true);
    }
  });

  test('includes notable golfers', () => {
    const names = PGA_GOLFERS.map(g => g.name);
    expect(names).toContain('Tiger Woods');
    expect(names).toContain('Rory McIlroy');
    expect(names).toContain('Jordan Spieth');
    expect(names).toContain('Jon Rahm');
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
});

describe('Pick Deadlines', () => {
  test('Player 1 deadline is Wednesday 6pm PDT', () => {
    // Thursday tournament start
    const deadline = getPickDeadline(0, '2026-04-09');
    // Should be Wednesday April 8, 2026 at 6pm PDT = April 9 01:00 UTC
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
});
