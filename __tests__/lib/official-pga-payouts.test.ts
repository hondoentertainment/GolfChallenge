/**
 * Validates purse math against publicly reported PGA Tour / major figures.
 *
 * When the Tour updates its published percentage table, refresh these fixtures
 * from an official leaderboard or “purse breakdown” article and adjust expected
 * dollars if the app’s `PRIZE_PAYOUT_PERCENTAGES` / `MASTERS_PAYOUT_PERCENTAGES`
 * in `pga-schedule.ts` are updated to match.
 *
 * References (April 2025 Masters and 2024 PLAYERS — widely republished):
 * - https://www.pgatour.com/article/news/latest/2025/04/12/purse-breakdown-prize-money-masters-tournament-augusta-national-green-jacket-scheffler
 * - https://www.pgatour.com/tournaments/2024/r004/overview
 */

import { calculatePrizeMoney, allocatePurseByFinishPositions } from '@/lib/pga-schedule';

const MASTERS = 'Masters Tournament';

/** Official total purse for the 2025 Masters (public reporting). */
const MASTERS_2025_PURSE = 21_000_000;

describe('Official figures — 2025 Masters Tournament ($21M purse)', () => {
  test.each([
    [1, 4_200_000],
    [2, 2_268_000],
    [3, 1_428_000],
    [4, 1_008_000],
    [7, 703_500], // 0.0335 * 21M
    [10, 567_000], // 0.027 * 21M
  ])('solo finish place %i paid $%i', (place, expected) => {
    expect(calculatePrizeMoney(MASTERS_2025_PURSE, place, MASTERS)).toBe(expected);
  });

  test('T5 (two players tied for 5th) paid $798,000 each — sum of 5th+6th places split', () => {
    const rows = [
      { id: 'a', position: 'T5' },
      { id: 'b', position: 'T5' },
    ];
    const alloc = allocatePurseByFinishPositions(MASTERS_2025_PURSE, MASTERS, rows);
    expect(alloc.get('a')).toBe(798_000);
    expect(alloc.get('b')).toBe(798_000);
    const fifth = calculatePrizeMoney(MASTERS_2025_PURSE, 5, MASTERS);
    const sixth = calculatePrizeMoney(MASTERS_2025_PURSE, 6, MASTERS);
    expect(fifth + sixth).toBe(1_596_000);
    expect(Math.round((fifth + sixth) / 2)).toBe(798_000);
  });
});

describe('Official figures — standard PGA Tour (2024 THE PLAYERS, $25M purse)', () => {
  const PLAYERS_2024_PURSE = 25_000_000;

  test('winner received $4,500,000 (18% of purse) per official results', () => {
    expect(calculatePrizeMoney(PLAYERS_2024_PURSE, 1)).toBe(4_500_000);
  });

  test.each([
    [2, 2_725_000], // 0.109 * 25M
    [3, 1_725_000], // 0.069 * 25M
    [10, 675_000], // 0.027 * 25M
  ])('place %i = $%i', (place, expected) => {
    expect(calculatePrizeMoney(PLAYERS_2024_PURSE, place)).toBe(expected);
  });

  test('T4 (three players) share places 4–6 payout pool equally', () => {
    const rows = [
      { id: 'p1', position: 'T4' },
      { id: 'p2', position: 'T4' },
      { id: 'p3', position: 'T4' },
    ];
    const alloc = allocatePurseByFinishPositions(PLAYERS_2024_PURSE, undefined, rows);
    const p4 = calculatePrizeMoney(PLAYERS_2024_PURSE, 4);
    const p5 = calculatePrizeMoney(PLAYERS_2024_PURSE, 5);
    const p6 = calculatePrizeMoney(PLAYERS_2024_PURSE, 6);
    const each = Math.round((p4 + p5 + p6) / 3);
    expect(alloc.get('p1')).toBe(each);
    expect(alloc.get('p2')).toBe(each);
    expect(alloc.get('p3')).toBe(each);
  });
});

describe('Standard table positions 61–65 (interpolated band)', () => {
  test('position 61 matches linear interpolation between published 60th and 65th shares', () => {
    const purse = 20_000_000;
    const pct60 = 0.0021;
    const pct65 = 0.002;
    const frac = (61 - 60) / 5;
    const expected = Math.round(purse * (pct60 + frac * (pct65 - pct60)));
    expect(calculatePrizeMoney(purse, 61)).toBe(expected);
    expect(expected).toBe(41_600);
  });
});
