jest.mock('@/lib/db', () => ({
  query: jest.fn(),
  execute: jest.fn(),
}));

import { logAction, getLeagueAuditLog } from '@/lib/audit';
import { query, execute } from '@/lib/db';

const mockQuery = query as jest.Mock;
const mockExecute = execute as jest.Mock;

beforeEach(() => jest.clearAllMocks());

describe('Audit Log', () => {
  test('logAction inserts audit entry', async () => {
    mockExecute.mockResolvedValue(undefined);
    await logAction('pick_made', 'Picked Scheffler', 'league-1', 'user-1');
    expect(mockExecute).toHaveBeenCalledTimes(1);
    expect(mockExecute).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO audit_log'),
      expect.arrayContaining(['league-1', 'user-1', 'pick_made', 'Picked Scheffler'])
    );
  });

  test('logAction works without optional params', async () => {
    mockExecute.mockResolvedValue(undefined);
    await logAction('system_event');
    expect(mockExecute).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO audit_log'),
      expect.arrayContaining([null, null, 'system_event', null])
    );
  });

  test('getLeagueAuditLog queries with correct params', async () => {
    mockQuery.mockResolvedValue([]);
    await getLeagueAuditLog('league-1', 25);
    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining('league_id = $1'),
      ['league-1', 25]
    );
  });
});
