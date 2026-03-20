import Database from 'better-sqlite3';
import { readFileSync, existsSync, mkdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

let db: Database.Database;

export function getDb(): Database.Database {
  if (!db) {
    const dataDir = process.env.SRIJAN_DATA_DIR || join(__dirname, '../../data');
    if (!existsSync(dataDir)) {
      mkdirSync(dataDir, { recursive: true });
    }
    const dbPath = join(dataDir, 'srijan.db');

    db = new Database(dbPath);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');

    const schema = readFileSync(join(__dirname, 'schema.sql'), 'utf-8');
    db.exec(schema);

    // Migrations for existing databases
    try { db.exec(`ALTER TABLE sessions ADD COLUMN workspace_name TEXT`); } catch {}
    try { db.exec(`ALTER TABLE apps ADD COLUMN workspace_name TEXT`); } catch {}
    try { db.exec(`ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'admin'`); } catch {}
    try { db.exec(`ALTER TABLE users ADD COLUMN totp_secret TEXT`); } catch {}
    try { db.exec(`ALTER TABLE users ADD COLUMN totp_enabled INTEGER NOT NULL DEFAULT 0`); } catch {}
    try { db.exec(`CREATE TABLE IF NOT EXISTS git_credentials (id TEXT PRIMARY KEY, workspace_name TEXT UNIQUE NOT NULL, provider TEXT NOT NULL DEFAULT 'generic', username TEXT NOT NULL DEFAULT '', encrypted_token TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now')))`); } catch {}
  }
  return db;
}

export function closeDb(): void {
  if (db) {
    db.close();
    db = undefined!;
  }
}
