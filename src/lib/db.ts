import Database from 'better-sqlite3';
import path from 'path';

const DB_PATH = path.join(process.cwd(), 'golf-challenge.db');

let db: Database.Database;

function getDb(): Database.Database {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    initializeDb(db);
  }
  return db;
}

function initializeDb(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS leagues (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      invite_code TEXT UNIQUE NOT NULL,
      created_by TEXT NOT NULL,
      season TEXT NOT NULL DEFAULT '2025-2026',
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (created_by) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS league_members (
      id TEXT PRIMARY KEY,
      league_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      joined_at TEXT DEFAULT (datetime('now')),
      UNIQUE(league_id, user_id),
      FOREIGN KEY (league_id) REFERENCES leagues(id),
      FOREIGN KEY (user_id) REFERENCES users(id)
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
      tournament_id TEXT NOT NULL,
      golfer_id TEXT NOT NULL,
      position TEXT,
      prize_money INTEGER DEFAULT 0,
      score TEXT,
      UNIQUE(tournament_id, golfer_id),
      FOREIGN KEY (tournament_id) REFERENCES tournaments(id),
      FOREIGN KEY (golfer_id) REFERENCES golfers(id)
    );

    CREATE TABLE IF NOT EXISTS picks (
      id TEXT PRIMARY KEY,
      league_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      tournament_id TEXT NOT NULL,
      golfer_id TEXT NOT NULL,
      picked_at TEXT DEFAULT (datetime('now')),
      pick_order INTEGER NOT NULL,
      UNIQUE(league_id, user_id, tournament_id),
      UNIQUE(league_id, tournament_id, golfer_id),
      FOREIGN KEY (league_id) REFERENCES leagues(id),
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (tournament_id) REFERENCES tournaments(id),
      FOREIGN KEY (golfer_id) REFERENCES golfers(id)
    );

    CREATE TABLE IF NOT EXISTS pick_order (
      id TEXT PRIMARY KEY,
      league_id TEXT NOT NULL,
      tournament_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      pick_position INTEGER NOT NULL,
      deadline TEXT NOT NULL,
      UNIQUE(league_id, tournament_id, user_id),
      FOREIGN KEY (league_id) REFERENCES leagues(id),
      FOREIGN KEY (tournament_id) REFERENCES tournaments(id),
      FOREIGN KEY (user_id) REFERENCES users(id)
    );
  `);
}

export default getDb;
