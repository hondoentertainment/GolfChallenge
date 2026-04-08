import { query, queryOne, execute } from './db';
import { v4 as uuidv4 } from 'uuid';

export interface Badge {
  id: string;
  user_id: string;
  league_id: string;
  badge_type: string;
  label: string;
  value: string | null;
  earned_at: string;
}

const BADGE_DEFS: Record<string, { label: string; check: string }> = {
  first_pick: { label: "First Pick", check: "Made their first pick" },
  top10_streak_3: { label: "Hot Streak (3)", check: "3 consecutive top-10 golfer finishes" },
  top10_streak_5: { label: "On Fire (5)", check: "5 consecutive top-10 golfer finishes" },
  best_week: { label: "Big Week", check: "Highest single-week earnings in the league" },
  most_consistent: { label: "Mr. Consistent", check: "Every pick finished in the money" },
  season_winner: { label: "Champion", check: "Won the season" },
  golfer_ace: { label: "Golfer Ace", check: "Picked a tournament winner" },
};

export function getBadgeDefs() { return BADGE_DEFS; }

export async function getUserBadges(userId: string, leagueId: string): Promise<Badge[]> {
  return query<Badge>(
    'SELECT * FROM badges WHERE user_id = $1 AND league_id = $2 ORDER BY earned_at DESC',
    [userId, leagueId]
  );
}

export async function awardBadge(userId: string, leagueId: string, badgeType: string, value?: string): Promise<Badge | null> {
  const def = BADGE_DEFS[badgeType];
  if (!def) return null;

  const existing = await queryOne(
    'SELECT id FROM badges WHERE user_id = $1 AND league_id = $2 AND badge_type = $3',
    [userId, leagueId, badgeType]
  );
  if (existing) return null;

  const id = uuidv4();
  await execute(
    'INSERT INTO badges (id, user_id, league_id, badge_type, label, value) VALUES ($1, $2, $3, $4, $5, $6)',
    [id, userId, leagueId, badgeType, def.label, value || null]
  );
  return { id, user_id: userId, league_id: leagueId, badge_type: badgeType, label: def.label, value: value || null, earned_at: new Date().toISOString() };
}

// Recalculate badges after results are entered
export async function recalculateBadges(leagueId: string): Promise<void> {
  const members = await query<{ user_id: string }>(
    'SELECT user_id FROM league_members WHERE league_id = $1', [leagueId]
  );

  for (const m of members) {
    // First pick badge
    const pickCount = await queryOne<{ count: string }>(
      'SELECT COUNT(*)::int as count FROM picks WHERE league_id = $1 AND user_id = $2 AND is_missed = FALSE',
      [leagueId, m.user_id]
    );
    if (Number(pickCount?.count) >= 1) {
      await awardBadge(m.user_id, leagueId, 'first_pick');
    }

    // Golfer ace: picked a tournament winner
    const winnerPick = await queryOne(
      `SELECT p.id FROM picks p
       JOIN tournament_results tr ON tr.tournament_id = p.tournament_id AND tr.golfer_id = p.golfer_id
       WHERE p.league_id = $1 AND p.user_id = $2 AND tr.position IN ('1','T1')`,
      [leagueId, m.user_id]
    );
    if (winnerPick) {
      await awardBadge(m.user_id, leagueId, 'golfer_ace');
    }

    // Top-10 streak
    const results = await query<{ prize_money: string; position: string }>(
      `SELECT tr.position, COALESCE(tr.prize_money,0)::int as prize_money
       FROM picks p
       JOIN tournaments t ON p.tournament_id = t.id
       LEFT JOIN tournament_results tr ON tr.tournament_id = p.tournament_id AND tr.golfer_id = p.golfer_id
       WHERE p.league_id = $1 AND p.user_id = $2 AND p.is_missed = FALSE
       ORDER BY t.start_date ASC`,
      [leagueId, m.user_id]
    );

    let streak = 0;
    let allInMoney = results.length > 0;
    for (const r of results) {
      const pos = r.position?.replace('T', '');
      if (pos && Number(pos) <= 10) {
        streak++;
        if (streak >= 3) await awardBadge(m.user_id, leagueId, 'top10_streak_3');
        if (streak >= 5) await awardBadge(m.user_id, leagueId, 'top10_streak_5');
      } else {
        streak = 0;
      }
      if (Number(r.prize_money) === 0 && r.position) allInMoney = false;
    }

    if (allInMoney && results.length >= 3) {
      await awardBadge(m.user_id, leagueId, 'most_consistent');
    }
  }

  // Best single week across all members
  const bestWeek = await queryOne<{ user_id: string; prize_money: string }>(
    `SELECT p.user_id, COALESCE(tr.prize_money,0)::int as prize_money
     FROM picks p
     JOIN tournament_results tr ON tr.tournament_id = p.tournament_id AND tr.golfer_id = p.golfer_id
     WHERE p.league_id = $1
     ORDER BY tr.prize_money DESC LIMIT 1`,
    [leagueId]
  );
  if (bestWeek && Number(bestWeek.prize_money) > 0) {
    await awardBadge(bestWeek.user_id, leagueId, 'best_week', `$${Number(bestWeek.prize_money).toLocaleString()}`);
  }
}
