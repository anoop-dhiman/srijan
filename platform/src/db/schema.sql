-- Srijan Platform Schema

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username TEXT UNIQUE NOT NULL DEFAULT 'admin',
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'admin',
  totp_secret TEXT,
  totp_enabled INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  title TEXT DEFAULT 'New Session',
  status TEXT NOT NULL DEFAULT 'active', -- active, paused, completed
  workspace_name TEXT,
  registration_token TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL REFERENCES sessions(id),
  type TEXT NOT NULL, -- user_message, agent_response, action, observation, error
  data TEXT NOT NULL, -- JSON
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS secrets (
  id TEXT PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  encrypted_value TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS apps (
  id TEXT PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  path TEXT UNIQUE NOT NULL,
  port INTEGER NOT NULL,
  container_id TEXT,
  workspace_name TEXT,
  status TEXT NOT NULL DEFAULT 'running', -- running, stopped, error
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS config (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS git_credentials (
  id TEXT PRIMARY KEY,
  workspace_name TEXT UNIQUE NOT NULL,
  provider TEXT NOT NULL DEFAULT 'generic', -- 'github' | 'azure' | 'generic'
  username TEXT NOT NULL DEFAULT '',
  encrypted_token TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS token_usage (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  cost_usd REAL,
  model TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS workspace_spending (
  workspace_name TEXT PRIMARY KEY,
  spending_limit_usd REAL,
  spending_reset_at TEXT
);

CREATE TABLE IF NOT EXISTS user_oauth_tokens (
  user_id                 TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  encrypted_access_token  TEXT NOT NULL,
  encrypted_refresh_token TEXT,
  expires_at              INTEGER,
  account_email           TEXT,
  subscription_type       TEXT,
  updated_at              TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS agent_roles (
  id                     TEXT PRIMARY KEY,
  name                   TEXT UNIQUE NOT NULL,
  display_name           TEXT NOT NULL,
  description            TEXT NOT NULL DEFAULT '',
  system_prompt_addition TEXT NOT NULL DEFAULT '',
  allowed_tools          TEXT,
  blocked_tools          TEXT NOT NULL DEFAULT '[]',
  subdir                 TEXT NOT NULL DEFAULT '',
  is_default             INTEGER NOT NULL DEFAULT 0,
  created_at             TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS session_agents (
  id               TEXT PRIMARY KEY,
  session_id       TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  name             TEXT NOT NULL,
  display_name     TEXT NOT NULL,
  role_id          TEXT REFERENCES agent_roles(id),
  subdir           TEXT NOT NULL DEFAULT '',
  claude_session_id TEXT,
  status           TEXT NOT NULL DEFAULT 'idle',
  created_at       TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(session_id, name)
);

-- Indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_workspace_name ON sessions(workspace_name);
CREATE INDEX IF NOT EXISTS idx_events_session_id ON events(session_id);
CREATE INDEX IF NOT EXISTS idx_token_usage_session_id ON token_usage(session_id);
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_secrets_name ON secrets(name);
CREATE INDEX IF NOT EXISTS idx_apps_name ON apps(name);
CREATE INDEX IF NOT EXISTS idx_session_agents_session_id ON session_agents(session_id);
