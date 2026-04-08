import { query, execute } from './db';
import { v4 as uuidv4 } from 'uuid';

export interface ChatMessage {
  id: string;
  league_id: string;
  user_id: string;
  username: string;
  message: string;
  created_at: string;
}

export async function sendMessage(leagueId: string, userId: string, message: string): Promise<ChatMessage> {
  const id = uuidv4();
  await execute(
    'INSERT INTO league_messages (id, league_id, user_id, message) VALUES ($1, $2, $3, $4)',
    [id, leagueId, userId, message]
  );
  const row = await query<ChatMessage>(
    `SELECT lm.*, u.username FROM league_messages lm
     JOIN users u ON lm.user_id = u.id WHERE lm.id = $1`,
    [id]
  );
  return row[0];
}

export async function getMessages(leagueId: string, limit = 50, before?: string): Promise<ChatMessage[]> {
  if (before) {
    return query<ChatMessage>(
      `SELECT lm.*, u.username FROM league_messages lm
       JOIN users u ON lm.user_id = u.id
       WHERE lm.league_id = $1 AND lm.created_at < $2
       ORDER BY lm.created_at DESC LIMIT $3`,
      [leagueId, before, limit]
    );
  }
  return query<ChatMessage>(
    `SELECT lm.*, u.username FROM league_messages lm
     JOIN users u ON lm.user_id = u.id
     WHERE lm.league_id = $1
     ORDER BY lm.created_at DESC LIMIT $2`,
    [leagueId, limit]
  );
}

export async function getMessagesSince(leagueId: string, since: string): Promise<ChatMessage[]> {
  return query<ChatMessage>(
    `SELECT lm.*, u.username FROM league_messages lm
     JOIN users u ON lm.user_id = u.id
     WHERE lm.league_id = $1 AND lm.created_at > $2
     ORDER BY lm.created_at ASC`,
    [leagueId, since]
  );
}
