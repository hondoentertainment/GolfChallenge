import { Pool } from '@neondatabase/serverless';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

export async function query<T = Record<string, unknown>>(text: string, params?: unknown[]): Promise<T[]> {
  const res = await pool.query(text, params);
  return res.rows as T[];
}

export async function queryOne<T = Record<string, unknown>>(text: string, params?: unknown[]): Promise<T | null> {
  const res = await pool.query(text, params);
  return (res.rows[0] as T) || null;
}

export async function execute(text: string, params?: unknown[]): Promise<void> {
  await pool.query(text, params);
}

export async function initializeDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      is_admin BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      expires_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS password_resets (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      token TEXT UNIQUE NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL,
      used BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS leagues (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      invite_code TEXT UNIQUE NOT NULL,
      created_by TEXT NOT NULL REFERENCES users(id),
      season TEXT NOT NULL DEFAULT '2025-2026',
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS league_members (
      id TEXT PRIMARY KEY,
      league_id TEXT NOT NULL REFERENCES leagues(id),
      user_id TEXT NOT NULL REFERENCES users(id),
      joined_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(league_id, user_id)
    );

    CREATE TABLE IF NOT EXISTS tournaments (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      start_date TEXT NOT NULL,
      end_date TEXT NOT NULL,
      course TEXT,
      location TEXT,
      purse INTEGER,
      season TEXT NOT NULL DEFAULT '2025-2026',
      status TEXT DEFAULT 'upcoming',
      is_excluded INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS golfers (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      world_ranking INTEGER,
      country TEXT
    );

    CREATE TABLE IF NOT EXISTS tournament_results (
      id TEXT PRIMARY KEY,
      tournament_id TEXT NOT NULL REFERENCES tournaments(id),
      golfer_id TEXT NOT NULL REFERENCES golfers(id),
      position TEXT,
      prize_money INTEGER DEFAULT 0,
      score TEXT,
      UNIQUE(tournament_id, golfer_id)
    );

    CREATE TABLE IF NOT EXISTS picks (
      id TEXT PRIMARY KEY,
      league_id TEXT NOT NULL REFERENCES leagues(id),
      user_id TEXT NOT NULL REFERENCES users(id),
      tournament_id TEXT NOT NULL REFERENCES tournaments(id),
      golfer_id TEXT NOT NULL REFERENCES golfers(id),
      picked_at TIMESTAMPTZ DEFAULT NOW(),
      pick_order INTEGER NOT NULL,
      UNIQUE(league_id, user_id, tournament_id),
      UNIQUE(league_id, tournament_id, golfer_id)
    );

    CREATE TABLE IF NOT EXISTS league_messages (
      id TEXT PRIMARY KEY,
      league_id TEXT NOT NULL REFERENCES leagues(id),
      user_id TEXT NOT NULL REFERENCES users(id),
      message TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS notifications (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      read BOOLEAN DEFAULT FALSE,
      league_id TEXT REFERENCES leagues(id),
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
    CREATE INDEX IF NOT EXISTS idx_picks_league ON picks(league_id);
    CREATE INDEX IF NOT EXISTS idx_picks_user ON picks(user_id);
    CREATE INDEX IF NOT EXISTS idx_messages_league ON league_messages(league_id);
    CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id);
    CREATE INDEX IF NOT EXISTS idx_tournament_results_tournament ON tournament_results(tournament_id);
  `);
}
