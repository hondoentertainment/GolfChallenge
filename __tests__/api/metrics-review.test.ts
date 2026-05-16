jest.mock('@/lib/auth', () => ({
  getCurrentUser: jest.fn(),
}));
jest.mock('@/lib/metrics-review-access', () => ({
  canAccessMetricsReview: jest.fn(),
}));
jest.mock('@/lib/seed', () => ({
  ensureSeeded: jest.fn(),
}));
jest.mock('@/lib/db', () => ({
  query: jest.fn(),
}));
jest.mock('@/lib/picks', () => ({
  getTournaments: jest.fn(),
  getLeaguePicks: jest.fn(),
}));
jest.mock('@/lib/leagues', () => ({
  getLeagueMembers: jest.fn(),
}));

import { GET } from '@/app/api/admin/metrics-review/route';
import { getCurrentUser } from '@/lib/auth';
import { canAccessMetricsReview } from '@/lib/metrics-review-access';
import { query } from '@/lib/db';
import { getTournaments, getLeaguePicks } from '@/lib/picks';
import { getLeagueMembers } from '@/lib/leagues';

const mockUser = getCurrentUser as jest.Mock;
const mockCanAccess = canAccessMetricsReview as jest.Mock;
const mockQuery = query as jest.Mock;
const mockGetTournaments = getTournaments as jest.Mock;
const mockGetLeaguePicks = getLeaguePicks as jest.Mock;
const mockGetLeagueMembers = getLeagueMembers as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  global.fetch = jest.fn(() =>
    Promise.resolve({
      ok: true,
      json: () =>
        Promise.resolve({
          workflow_runs: [
            {
              conclusion: 'success',
              status: 'completed',
              html_url: 'https://github.com/run',
              head_sha: 'abc',
              updated_at: '2026-01-01T00:00:00Z',
              name: 'CI',
            },
          ],
        }),
    }),
  ) as jest.Mock;
});

describe('GET /api/admin/metrics-review', () => {
  test('403 when reviewer access denied', async () => {
    mockUser.mockResolvedValue({ id: '1', email: 'x@y.com', is_admin: true, username: 'x' });
    mockCanAccess.mockReturnValue(false);
    const res = await GET();
    expect(res.status).toBe(403);
  });

  test('200 returns leagues and ci summary for reviewer', async () => {
    mockUser.mockResolvedValue({
      id: '1',
      email: 'hondo4185@gmail.com',
      is_admin: true,
      username: 'hondo',
    });
    mockCanAccess.mockReturnValue(true);

    mockGetTournaments.mockResolvedValue([
      {
        id: 't1',
        name: 'Masters Tournament',
        start_date: '2026-04-09',
        end_date: '2026-04-12',
        course: '',
        location: '',
        purse: 21_000_000,
        season: '2025-2026',
        status: 'completed',
        is_excluded: 0,
      },
    ]);

    mockQuery
      .mockResolvedValueOnce([{ id: 'L1', name: 'Test League' }])
      .mockResolvedValueOnce([{ tournament_id: 't1', cnt: '10' }]);

    mockGetLeagueMembers.mockResolvedValue([
      { id: 'm1', league_id: 'L1', user_id: 'u1', username: 'alice', joined_at: '' },
    ]);

    mockGetLeaguePicks.mockResolvedValue([
      {
        id: 'p1',
        league_id: 'L1',
        user_id: 'u1',
        tournament_id: 't1',
        golfer_id: 'g1',
        picked_at: '',
        pick_order: 0,
        username: 'alice',
        golfer_name: 'Scottie Scheffler',
        tournament_name: 'Masters Tournament',
        prize_money: 1000,
        position: '5',
        score: '-8',
      },
    ]);

    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.season).toBe('2025-2026');
    expect(body.ci.testsPassing).toBe(true);
    expect(body.leagues).toHaveLength(1);
    expect(body.leagues[0].players[0].seasonTotal).toBe(1000);
    expect(body.leagues[0].players[0].events[0].metricsConfirmed).toBe(true);
  });
});
