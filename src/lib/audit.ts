import { query, execute } from './db';
import { v4 as uuidv4 } from 'uuid';

export interface AuditEntry {
  id: string;
  league_id: string | null;
  user_id: string | null;
  action: string;
  details: string | null;
  created_at: string;
}

export async function logAction(action: string, details?: string, leagueId?: string, userId?: string): Promise<void> {
  await execute(
    'INSERT INTO audit_log (id, league_id, user_id, action, details) VALUES ($1, $2, $3, $4, $5)',
    [uuidv4(), leagueId || null, userId || null, action, details || null]
  );
}

export async function getLeagueAuditLog(leagueId: string, limit = 50): Promise<AuditEntry[]> {
  return query<AuditEntry>(
    'SELECT * FROM audit_log WHERE league_id = $1 ORDER BY created_at DESC LIMIT $2',
    [leagueId, limit]
  );
}
