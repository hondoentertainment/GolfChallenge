jest.mock('@/lib/db', () => ({
  query: jest.fn(),
  queryOne: jest.fn(),
  execute: jest.fn(),
}));

import { getUserBadges, awardBadge, getBadgeDefs } from '@/lib/badges';
import { query, queryOne, execute } from '@/lib/db';

const mockQuery = query as jest.Mock;
const mockQueryOne = queryOne as jest.Mock;
const mockExecute = execute as jest.Mock;

beforeEach(() => jest.clearAllMocks());

describe('Badges', () => {
  test('getBadgeDefs returns all 7 badge types', () => {
    const defs = getBadgeDefs();
    expect(Object.keys(defs).length).toBe(7);
    expect(defs.first_pick).toBeDefined();
    expect(defs.season_winner).toBeDefined();
    expect(defs.golfer_ace).toBeDefined();
    expect(defs.top10_streak_3).toBeDefined();
    expect(defs.top10_streak_5).toBeDefined();
    expect(defs.best_week).toBeDefined();
    expect(defs.most_consistent).toBeDefined();
  });

  test('awardBadge does not award duplicate badge', async () => {
    mockQueryOne.mockResolvedValue({ id: 'existing' });
    const result = await awardBadge('user-1', 'league-1', 'first_pick');
    expect(result).toBeNull();
    expect(mockExecute).not.toHaveBeenCalled();
  });

  test('awardBadge creates new badge', async () => {
    mockQueryOne.mockResolvedValue(null);
    mockExecute.mockResolvedValue(undefined);
    const result = await awardBadge('user-1', 'league-1', 'first_pick');
    expect(result).not.toBeNull();
    expect(result?.badge_type).toBe('first_pick');
    expect(result?.label).toBe('First Pick');
    expect(mockExecute).toHaveBeenCalledTimes(1);
  });

  test('awardBadge returns null for unknown badge type', async () => {
    const result = await awardBadge('user-1', 'league-1', 'nonexistent_badge');
    expect(result).toBeNull();
  });

  test('getUserBadges queries correctly', async () => {
    mockQuery.mockResolvedValue([]);
    await getUserBadges('user-1', 'league-1');
    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining('user_id = $1 AND league_id = $2'),
      ['user-1', 'league-1']
    );
  });
});
