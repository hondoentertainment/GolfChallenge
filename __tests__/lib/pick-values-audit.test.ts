jest.mock('@/lib/db', () => ({
  query: jest.fn(),
  queryOne: jest.fn(),
  execute: jest.fn(),
}));

import { query } from '@/lib/db';
import { auditAllPickValues } from '@/lib/picks';
import { CHALLENGE_SEASON, CHALLENGE_TOURNAMENTS_START_ON_OR_AFTER } from '@/lib/challenge-season';
import { CHALLENGE_PUBLISHED_PAYOUT_BY_TOURNAMENT } from '@/lib/challenge-published-payouts-2026';
import { allocatePurseByFinishPositions } from '@/lib/pga-schedule';

const mockQuery = query as jest.Mock;

function driftRowsForTournament(tournamentName: string, purse: number) {
  const resultId = 'tr-1';
  const base = [{ id: resultId, position: '1' }];
  const expected = allocatePurseByFinishPositions(purse, tournamentName, base).get(resultId)!;
  return [
    {
      id: resultId,
      position: '1',
      prize_money: expected + 5000,
      golfer_name: 'Audit Test Golfer',
    },
  ];
}

describe('auditAllPickValues payout drift vs media tables', () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });

  test('does not flag tie-table drift for tournaments with a published media payout table', async () => {
    const publishedName = Object.keys(CHALLENGE_PUBLISHED_PAYOUT_BY_TOURNAMENT)[0];
    expect(publishedName).toBeDefined();
    const purse = 18_000_000;

    mockQuery
      .mockResolvedValueOnce([{ id: 't-pub', name: publishedName, purse }])
      .mockResolvedValueOnce(driftRowsForTournament(publishedName, purse))
      .mockResolvedValueOnce([]);

    const report = await auditAllPickValues(CHALLENGE_SEASON);

    expect(report.payoutDrifts).toHaveLength(0);
    expect(report.payoutDriftsIgnoredForMedia).toBe(1);
    expect(report.skippedPublishedTournaments).toEqual([publishedName]);
    expect(report.summary.resultRowsOutOfSyncWithTieTable).toBe(0);
    expect(report.summary.ok).toBe(true);
    expect(mockQuery).toHaveBeenCalledTimes(3);
  });

  test('flags tie-table drift when no transcribed media table exists for the event name', async () => {
    const name = 'ZZZ Synthetic Unpublished Invitational';
    expect(CHALLENGE_PUBLISHED_PAYOUT_BY_TOURNAMENT[name]).toBeUndefined();
    const purse = 18_000_000;
    const rows = driftRowsForTournament(name, purse);

    mockQuery
      .mockResolvedValueOnce([{ id: 't-unpub', name, purse }])
      .mockResolvedValueOnce(rows)
      .mockResolvedValueOnce([]);

    const report = await auditAllPickValues(CHALLENGE_SEASON);

    expect(report.payoutDrifts).toHaveLength(1);
    expect(report.payoutDriftsIgnoredForMedia).toBe(0);
    expect(report.skippedPublishedTournaments).toEqual([]);
    expect(report.summary.resultRowsOutOfSyncWithTieTable).toBe(1);
    expect(report.summary.ok).toBe(false);
    expect(report.payoutDrifts[0].stored).toBe(rows[0].prize_money);
  });

  test('passes season and start-date bound into SQL', async () => {
    mockQuery.mockResolvedValueOnce([]).mockResolvedValueOnce([]);

    await auditAllPickValues(CHALLENGE_SEASON);

    expect(mockQuery.mock.calls[0][1]).toEqual([CHALLENGE_SEASON, CHALLENGE_TOURNAMENTS_START_ON_OR_AFTER]);
    expect(mockQuery.mock.calls[1][1]).toEqual([CHALLENGE_SEASON, CHALLENGE_TOURNAMENTS_START_ON_OR_AFTER]);
  });
});
