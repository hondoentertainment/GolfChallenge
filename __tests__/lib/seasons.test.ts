jest.mock('@/lib/db', () => ({
  query: jest.fn(),
  queryOne: jest.fn(),
  execute: jest.fn(),
}));
jest.mock('@/lib/picks', () => ({
  getLeagueStandings: jest.fn(),
}));
jest.mock('@/lib/badges', () => ({
  awardBadge: jest.fn(),
}));
jest.mock('@/lib/audit', () => ({
  logAction: jest.fn(),
}));

import { archiveSeason, getArchivedSeasons, getPriorSeasonDraftOrder } from '@/lib/seasons';
import { queryOne, execute, query } from '@/lib/db';
import { getLeagueStandings } from '@/lib/picks';

const mockQueryOne = queryOne as jest.Mock;
const mockExecute = execute as jest.Mock;
const mockQuery = query as jest.Mock;
const mockGetStandings = getLeagueStandings as jest.Mock;

beforeEach(() => jest.clearAllMocks());

describe('Season Management', () => {
  test('archiveSeason throws if already archived', async () => {
    mockQueryOne.mockResolvedValue({ id: 'existing' });
    await expect(archiveSeason('l-1', '2025-2026', 'u-1')).rejects.toThrow('already archived');
  });

  test('archiveSeason creates archive with winner', async () => {
    mockQueryOne.mockResolvedValue(null); // not already archived
    mockGetStandings.mockResolvedValue([
      { userId: 'u-1', username: 'Winner', totalPrizeMoney: 5000000, pickCount: 9 },
      { userId: 'u-2', username: 'Second', totalPrizeMoney: 3000000, pickCount: 9 },
    ]);
    mockExecute.mockResolvedValue(undefined);

    const result = await archiveSeason('l-1', '2025-2026', 'u-1');
    expect(result.winner_username).toBe('Winner');
    expect(result.winner_earnings).toBe(5000000);
    expect(result.season).toBe('2025-2026');
  });

  test('getArchivedSeasons queries correctly', async () => {
    mockQuery.mockResolvedValue([]);
    await getArchivedSeasons('l-1');
    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining('league_id = $1'),
      ['l-1']
    );
  });

  test('getPriorSeasonDraftOrder reverses standings (worst first)', async () => {
    mockQueryOne.mockResolvedValue({
      standings_json: JSON.stringify([
        { userId: 'winner' },
        { userId: 'second' },
        { userId: 'last' },
      ]),
    });
    const order = await getPriorSeasonDraftOrder('l-1');
    expect(order).toEqual(['last', 'second', 'winner']);
  });

  test('getPriorSeasonDraftOrder returns empty for no archive', async () => {
    mockQueryOne.mockResolvedValue(null);
    const order = await getPriorSeasonDraftOrder('l-1');
    expect(order).toEqual([]);
  });
});
