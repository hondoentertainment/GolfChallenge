import initSqlJs from 'sql.js';
import type { Database as SqlJsDatabase, SqlJsStatic } from 'sql.js';
import path from 'path';
import fs from 'fs';

// Use /tmp on Vercel (serverless), or project root locally
const DB_DIR = process.env.VERCEL ? '/tmp' : process.cwd();
const DB_PATH = path.join(DB_DIR, 'golf-challenge.db');

let db: DbWrapper | null = null;
let SQL: SqlJsStatic | null = null;

// Compatibility wrapper that provides a better-sqlite3-like API over sql.js
export class DbWrapper {
  constructor(public raw: SqlJsDatabase) {}

  prepare(sql: string) {
    const rawDb = this.raw;
    return {
      run(...params: unknown[]) {
        rawDb.run(sql, params as unknown[]);
        saveDb();
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      get(...params: unknown[]): any {
        const stmt = rawDb.prepare(sql);
        stmt.bind(params as unknown[]);
        if (stmt.step()) {
          const cols = stmt.getColumnNames();
          const vals = stmt.get();
          const row: Record<string, unknown> = {};
          for (let i = 0; i < cols.length; i++) {
            row[cols[i]] = vals[i];
          }
          stmt.free();
          return row;
        }
        stmt.free();
        return undefined;
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      all(...params: unknown[]): any[] {
        const stmt = rawDb.prepare(sql);
        stmt.bind(params as unknown[]);
        const rows: Record<string, unknown>[] = [];
        while (stmt.step()) {
          const cols = stmt.getColumnNames();
          const vals = stmt.get();
          const row: Record<string, unknown> = {};
          for (let i = 0; i < cols.length; i++) {
            row[cols[i]] = vals[i];
          }
          rows.push(row);
        }
        stmt.free();
        return rows;
      },
    };
  }

  exec(sql: string) {
    this.raw.run(sql);
    saveDb();
  }

  transaction<T>(fn: () => T): () => T {
    const self = this;
    return () => {
      self.raw.run('BEGIN TRANSACTION');
      try {
        const result = fn();
        self.raw.run('COMMIT');
        saveDb();
        return result;
      } catch (e) {
        self.raw.run('ROLLBACK');
        throw e;
      }
    };
  }
}

async function initSql() {
  if (!SQL) {
    SQL = await initSqlJs();
  }
  return SQL;
}

function loadOrCreateDb(SqlLib: SqlJsStatic): SqlJsDatabase {
  try {
    if (fs.existsSync(DB_PATH)) {
      const buffer = fs.readFileSync(DB_PATH);
      return new SqlLib.Database(buffer);
    }
  } catch {
    // Fall through to create new
  }
  return new SqlLib.Database();
}

function saveDb() {
  if (!db) return;
  try {
    const data = db.raw.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(DB_PATH, buffer);
  } catch {
    // Silently fail on write errors
  }
}

export async function getDbAsync(): Promise<DbWrapper> {
  if (db) return db;

  const SqlLib = await initSql();
  const rawDb = loadOrCreateDb(SqlLib);
  db = new DbWrapper(rawDb);

  db.raw.run('PRAGMA foreign_keys = ON');
  initializeDb(db);
  saveDb();

  return db;
}

// Synchronous getter - only works after first async init
export default function getDb(): DbWrapper {
  if (!db) {
    throw new Error('Database not initialized. Call getDbAsync() first.');
  }
  return db;
}

function initializeDb(database: DbWrapper) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);
  database.exec(`
    CREATE TABLE IF NOT EXISTS leagues (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      invite_code TEXT UNIQUE NOT NULL,
      created_by TEXT NOT NULL,
      season TEXT NOT NULL DEFAULT '2025-2026',
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (created_by) REFERENCES users(id)
    )
  `);
  database.exec(`
    CREATE TABLE IF NOT EXISTS league_members (
      id TEXT PRIMARY KEY,
      league_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      joined_at TEXT DEFAULT (datetime('now')),
      UNIQUE(league_id, user_id),
      FOREIGN KEY (league_id) REFERENCES leagues(id),
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);
  database.exec(`
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
    )
  `);
  database.exec(`
    CREATE TABLE IF NOT EXISTS golfers (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      world_ranking INTEGER,
      country TEXT
    )
  `);
  database.exec(`
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
    )
  `);
  database.exec(`
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
    )
  `);
  database.exec(`
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
    )
  `);
}
