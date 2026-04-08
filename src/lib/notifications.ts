import { query, queryOne, execute } from './db';
import { v4 as uuidv4 } from 'uuid';

export interface Notification {
  id: string;
  user_id: string;
  type: string;
  title: string;
  body: string;
  read: boolean;
  league_id: string | null;
  created_at: string;
}

export async function createNotification(
  userId: string,
  type: string,
  title: string,
  body: string,
  leagueId?: string
): Promise<Notification> {
  const id = uuidv4();
  await execute(
    'INSERT INTO notifications (id, user_id, type, title, body, league_id) VALUES ($1, $2, $3, $4, $5, $6)',
    [id, userId, type, title, body, leagueId || null]
  );
  return { id, user_id: userId, type, title, body, read: false, league_id: leagueId || null, created_at: new Date().toISOString() };
}

export async function getUserNotifications(userId: string, limit = 20): Promise<Notification[]> {
  return query<Notification>(
    'SELECT * FROM notifications WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2',
    [userId, limit]
  );
}

export async function getUnreadCount(userId: string): Promise<number> {
  const row = await queryOne<{ count: string }>(
    'SELECT COUNT(*)::int as count FROM notifications WHERE user_id = $1 AND read = FALSE',
    [userId]
  );
  return Number(row?.count ?? 0);
}

export async function markAsRead(notificationId: string, userId: string): Promise<void> {
  await execute(
    'UPDATE notifications SET read = TRUE WHERE id = $1 AND user_id = $2',
    [notificationId, userId]
  );
}

export async function markAllAsRead(userId: string): Promise<void> {
  await execute('UPDATE notifications SET read = TRUE WHERE user_id = $1', [userId]);
}

// Notify all league members except the actor
export async function notifyLeagueMembers(
  leagueId: string,
  excludeUserId: string,
  type: string,
  title: string,
  body: string
): Promise<void> {
  const members = await query<{ user_id: string }>(
    'SELECT user_id FROM league_members WHERE league_id = $1 AND user_id != $2',
    [leagueId, excludeUserId]
  );
  for (const m of members) {
    await createNotification(m.user_id, type, title, body, leagueId);
  }
}
