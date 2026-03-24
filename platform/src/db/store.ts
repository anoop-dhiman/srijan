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
    tryMigrate(`CREATE TABLE IF NOT EXISTS user_oauth_tokens (user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE, encrypted_access_token TEXT NOT NULL, encrypted_refresh_token TEXT, expires_at INTEGER, account_email TEXT, subscription_type TEXT, updated_at TEXT NOT NULL DEFAULT (datetime('now')))`);

    // Phase C: agent_roles table
    tryMigrate(`CREATE TABLE IF NOT EXISTS agent_roles (id TEXT PRIMARY KEY, name TEXT UNIQUE NOT NULL, display_name TEXT NOT NULL, description TEXT NOT NULL DEFAULT '', system_prompt_addition TEXT NOT NULL DEFAULT '', allowed_tools TEXT, blocked_tools TEXT NOT NULL DEFAULT '[]', subdir TEXT NOT NULL DEFAULT '', is_default INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT (datetime('now')))`);

    // Phase D migrations
    tryMigrate(`CREATE TABLE IF NOT EXISTS session_agents (id TEXT PRIMARY KEY, session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE, name TEXT NOT NULL, display_name TEXT NOT NULL, role_id TEXT REFERENCES agent_roles(id), subdir TEXT NOT NULL DEFAULT '', claude_session_id TEXT, status TEXT NOT NULL DEFAULT 'idle', created_at TEXT NOT NULL DEFAULT (datetime('now')), UNIQUE(session_id, name))`);
    tryMigrate(`CREATE INDEX IF NOT EXISTS idx_session_agents_session_id ON session_agents(session_id)`);
    tryMigrate(`ALTER TABLE token_usage ADD COLUMN agent_id TEXT`);
    tryMigrate(`ALTER TABLE events ADD COLUMN agent_id TEXT`);

    // Seed default roles if table is empty
    const roleCount = (db.prepare('SELECT COUNT(*) as cnt FROM agent_roles').get() as { cnt: number }).cnt;
    if (roleCount === 0) {
      const seedRoles = [
        { id: 'role-coder', name: 'coder', display_name: 'Full-Stack Coder', description: 'Full implementation access to all tools', system_prompt_addition: '', allowed_tools: null, is_default: 1 },
        { id: 'role-reviewer', name: 'reviewer', display_name: 'Code Reviewer', description: 'Read-only code review mode', system_prompt_addition: '## Mode: Code Review\nYou are in read-only review mode. Analyze code, identify issues, suggest improvements. Do NOT modify files or run commands.', allowed_tools: '["Read","Glob","Grep","LS"]', is_default: 0 },
        { id: 'role-devops', name: 'devops', display_name: 'DevOps Engineer', description: 'Infrastructure and deployment focus', system_prompt_addition: '## Mode: DevOps\nFocus on Docker, docker-compose, CI/CD, environment configuration, and deployment.', allowed_tools: '["Bash","Read","Write","Edit","Glob","Grep"]', is_default: 0 },
        { id: 'role-planner', name: 'planner', display_name: 'Architect Planner', description: 'Architecture planning without execution', system_prompt_addition: '## Mode: Architecture Planning\nFocus on design, planning, and documentation. Use propose_plan tool before starting work. Do NOT execute code or modify files.', allowed_tools: '["Read","Glob","Grep"]', is_default: 0 },
      ];
      const insertRole = db.prepare(`INSERT OR IGNORE INTO agent_roles (id, name, display_name, description, system_prompt_addition, allowed_tools, blocked_tools, subdir, is_default, created_at) VALUES (?, ?, ?, ?, ?, ?, '[]', '', ?, datetime('now'))`);
      for (const r of seedRoles) {
        insertRole.run(r.id, r.name, r.display_name, r.description, r.system_prompt_addition, r.allowed_tools, r.is_default);
      }
    }
  }
  return db;
}

export function closeDb(): void {
  if (db) {
    db.close();
    db = undefined!;
  }
}
