jest.mock('@/lib/db', () => ({
  query: jest.fn(),
  execute: jest.fn(),
}));

import { sendMessage, getMessages, getMessagesSince } from '@/lib/chat';
import { query, execute } from '@/lib/db';

const mockQuery = query as jest.Mock;
const mockExecute = execute as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
});

describe('Chat', () => {
  test('sendMessage inserts message and returns it', async () => {
    mockExecute.mockResolvedValue(undefined);
    mockQuery.mockResolvedValue([{
      id: 'msg-1', league_id: 'league-1', user_id: 'user-1',
      username: 'TestUser', message: 'Hello!', created_at: '2026-04-08T00:00:00Z',
    }]);

    const msg = await sendMessage('league-1', 'user-1', 'Hello!');
    expect(msg.message).toBe('Hello!');
    expect(msg.username).toBe('TestUser');
    expect(mockExecute).toHaveBeenCalledTimes(1);
  });

  test('getMessages fetches recent messages', async () => {
    mockQuery.mockResolvedValue([]);
    await getMessages('league-1', 25);
    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining('league_id = $1'),
      ['league-1', 25]
    );
  });

  test('getMessages with before param adds date filter', async () => {
    mockQuery.mockResolvedValue([]);
    await getMessages('league-1', 25, '2026-04-08T00:00:00Z');
    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining('created_at < $2'),
      ['league-1', '2026-04-08T00:00:00Z', 25]
    );
  });

  test('getMessagesSince fetches messages after timestamp', async () => {
    mockQuery.mockResolvedValue([]);
    await getMessagesSince('league-1', '2026-04-08T00:00:00Z');
    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining('created_at > $2'),
      ['league-1', '2026-04-08T00:00:00Z']
    );
  });
});
