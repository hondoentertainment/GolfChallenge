jest.mock('@/lib/auth', () => ({
  getCurrentUser: jest.fn(),
}));
jest.mock('@/lib/picks', () => ({
  updateTournamentResult: jest.fn(),
  updateTournamentStatus: jest.fn(),
  getTournaments: jest.fn(() => []),
  getGolfers: jest.fn(() => []),
}));
jest.mock('@/lib/pga-data', () => ({
  syncTournamentResults: jest.fn(),
}));
jest.mock('@/lib/notifications', () => ({
  notifyLeagueMembers: jest.fn(),
}));
jest.mock('@/lib/badges', () => ({
  recalculateBadges: jest.fn(),
}));
jest.mock('@/lib/audit', () => ({
  logAction: jest.fn(),
}));
jest.mock('@/lib/db', () => ({
  query: jest.fn(() => []),
}));
jest.mock('@/lib/seed', () => ({
  ensureSeeded: jest.fn(),
}));

import { GET, POST } from '@/app/api/admin/results/route';
import { getCurrentUser } from '@/lib/auth';
import { updateTournamentResult } from '@/lib/picks';
import { NextRequest } from 'next/server';

const mockGetCurrentUser = getCurrentUser as jest.Mock;
const mockUpdateResult = updateTournamentResult as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
});

describe('Admin Results API', () => {
  test('GET returns 403 for non-admin', async () => {
    mockGetCurrentUser.mockResolvedValue({ id: '1', username: 'user', is_admin: false });
    const res = await GET();
    expect(res.status).toBe(403);
  });

  test('GET returns 403 for unauthenticated', async () => {
    mockGetCurrentUser.mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(403);
  });

  test('POST enters manual results for admin', async () => {
    mockGetCurrentUser.mockResolvedValue({ id: '1', username: 'admin', is_admin: true });
    mockUpdateResult.mockResolvedValue(undefined);

    const req = new NextRequest('http://localhost/api/admin/results', {
      method: 'POST',
      body: JSON.stringify({
        tournamentId: 't-1',
        results: [
          { golferId: 'g-1', position: '1', prizeMoney: 3600000, score: '-18' },
          { golferId: 'g-2', position: '2', prizeMoney: 2180000, score: '-15' },
        ],
        status: 'completed',
      }),
    });

    const res = await POST(req);
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.updated).toBe(2);
    expect(mockUpdateResult).toHaveBeenCalledTimes(2);
  });

  test('POST returns 400 for missing fields', async () => {
    mockGetCurrentUser.mockResolvedValue({ id: '1', username: 'admin', is_admin: true });
    const req = new NextRequest('http://localhost/api/admin/results', {
      method: 'POST',
      body: JSON.stringify({ tournamentId: 't-1' }), // missing results
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });
});
