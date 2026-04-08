// Mock the db module
jest.mock('@/lib/db', () => ({
  query: jest.fn(),
  queryOne: jest.fn(),
  execute: jest.fn(),
}));

import { createNotification, getUserNotifications, getUnreadCount, markAsRead, markAllAsRead } from '@/lib/notifications';
import { query, queryOne, execute } from '@/lib/db';

const mockQuery = query as jest.Mock;
const mockQueryOne = queryOne as jest.Mock;
const mockExecute = execute as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
});

describe('Notifications', () => {
  test('createNotification inserts and returns notification', async () => {
    mockExecute.mockResolvedValue(undefined);
    const n = await createNotification('user-1', 'pick', 'New pick!', 'Player made a pick', 'league-1');
    expect(n.user_id).toBe('user-1');
    expect(n.type).toBe('pick');
    expect(n.title).toBe('New pick!');
    expect(n.body).toBe('Player made a pick');
    expect(n.league_id).toBe('league-1');
    expect(n.read).toBe(false);
    expect(mockExecute).toHaveBeenCalledTimes(1);
  });

  test('getUserNotifications queries with correct params', async () => {
    mockQuery.mockResolvedValue([]);
    await getUserNotifications('user-1', 10);
    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining('user_id = $1'),
      ['user-1', 10]
    );
  });

  test('getUnreadCount returns number', async () => {
    mockQueryOne.mockResolvedValue({ count: '5' });
    const count = await getUnreadCount('user-1');
    expect(count).toBe(5);
  });

  test('getUnreadCount returns 0 when no results', async () => {
    mockQueryOne.mockResolvedValue(null);
    const count = await getUnreadCount('user-1');
    expect(count).toBe(0);
  });

  test('markAsRead updates specific notification', async () => {
    mockExecute.mockResolvedValue(undefined);
    await markAsRead('notif-1', 'user-1');
    expect(mockExecute).toHaveBeenCalledWith(
      expect.stringContaining('id = $1 AND user_id = $2'),
      ['notif-1', 'user-1']
    );
  });

  test('markAllAsRead updates all for user', async () => {
    mockExecute.mockResolvedValue(undefined);
    await markAllAsRead('user-1');
    expect(mockExecute).toHaveBeenCalledWith(
      expect.stringContaining('user_id = $1'),
      ['user-1']
    );
  });
});
