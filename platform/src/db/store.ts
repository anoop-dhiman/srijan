import Database from 'better-sqlite3';
import { readFileSync, existsSync, mkdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { createLogger } from '../lib/logger.js';

const log = createLogger('db');

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

let db: Database.Database;

function tryMigrate(sql: string): void {
  try {
    db.exec(sql);
  } catch (err: any) {
    // "duplicate column name" means the migration already ran — ignore it silently.
    // Any other error is unexpected and should be logged.
    if (!err.message?.includes('duplicate column name') && !err.message?.includes('already exists')) {
      log.warn({ sql: sql.trim() }, `Migration warning: ${err.message}`);
    }
  }
}

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
    db.pragma('busy_timeout = 5000');

    const schema = readFileSync(join(__dirname, 'schema.sql'), 'utf-8');
    db.exec(schema);

    // Migrations for existing databases
    tryMigrate(`ALTER TABLE sessions ADD COLUMN workspace_name TEXT`);
    tryMigrate(`ALTER TABLE apps ADD COLUMN workspace_name TEXT`);
    tryMigrate(`ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'admin'`);
    tryMigrate(`ALTER TABLE users ADD COLUMN totp_secret TEXT`);
    tryMigrate(`ALTER TABLE users ADD COLUMN totp_enabled INTEGER NOT NULL DEFAULT 0`);
    tryMigrate(`CREATE TABLE IF NOT EXISTS git_credentials (id TEXT PRIMARY KEY, workspace_name TEXT UNIQUE NOT NULL, provider TEXT NOT NULL DEFAULT 'generic', username TEXT NOT NULL DEFAULT '', encrypted_token TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now')))`);
    tryMigrate(`CREATE INDEX IF NOT EXISTS idx_users_username ON users(username)`);
    tryMigrate(`CREATE INDEX IF NOT EXISTS idx_secrets_name ON secrets(name)`);
    tryMigrate(`CREATE INDEX IF NOT EXISTS idx_apps_name ON apps(name)`);
    tryMigrate(`ALTER TABLE users ADD COLUMN spending_limit_usd REAL`);
    tryMigrate(`ALTER TABLE users ADD COLUMN spending_reset_at TEXT`);
    tryMigrate(`ALTER TABLE token_usage ADD COLUMN user_id TEXT`);
    tryMigrate(`ALTER TABLE token_usage ADD COLUMN workspace_name TEXT`);
    tryMigrate(`CREATE INDEX IF NOT EXISTS idx_token_usage_user_id ON token_usage(user_id)`);
    tryMigrate(`CREATE INDEX IF NOT EXISTS idx_token_usage_workspace_name ON token_usage(workspace_name)`);
    tryMigrate(`CREATE TABLE IF NOT EXISTS workspace_spending (workspace_name TEXT PRIMARY KEY, spending_limit_usd REAL, spending_reset_at TEXT)`);
    tryMigrate(`ALTER TABLE sessions ADD COLUMN registration_token TEXT`);
  }
  return db;
}

export function closeDb(): void {
  if (db) {
    db.close();
    db = undefined!;
  }
}
