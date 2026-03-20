import { getDb } from '../db/store.js';
import { encrypt, decrypt } from './crypto.js';
import { v4 as uuidv4 } from 'uuid';
import { createLogger } from './logger.js';

const log = createLogger('gitAuth');

export type GitProvider = 'github' | 'azure' | 'generic';

export interface GitCredentials {
  provider: GitProvider;
  username: string;
  token: string;
}

export function detectProvider(url: string): GitProvider {
  if (/github\.com/i.test(url)) return 'github';
  if (/dev\.azure\.com|visualstudio\.com/i.test(url)) return 'azure';
  return 'generic';
}

/** Build a URL with embedded basic-auth credentials for transient use during git operations. */
export function buildAuthUrl(url: string, username: string, token: string): string {
  const u = new URL(url);
  // Clear any existing credentials first
  u.username = encodeURIComponent(username || 'git');
  u.password = encodeURIComponent(token);
  return u.toString();
}

/** Remove embedded credentials from a URL so it can safely be stored in .git/config. */
export function stripAuthFromUrl(url: string): string {
  try {
    const u = new URL(url);
    u.username = '';
    u.password = '';
    return u.toString();
  } catch {
    return url;
  }
}

const SAFE_NAME_RE = /^[a-zA-Z0-9_-]+$/;

function validateName(name: string): void {
  if (!SAFE_NAME_RE.test(name)) {
    throw new Error(`Invalid workspace name: "${name}"`);
  }
}

export function getWorkspaceCredentials(workspaceName: string): GitCredentials | null {
  validateName(workspaceName);
  const db = getDb();
  const row = db.prepare(
    'SELECT provider, username, encrypted_token FROM git_credentials WHERE workspace_name = ?'
  ).get(workspaceName) as { provider: GitProvider; username: string; encrypted_token: string } | undefined;
  if (!row) return null;
  try {
    return {
      provider: row.provider,
      username: row.username,
      token: decrypt(row.encrypted_token),
    };
  } catch {
    log.warn(`Failed to decrypt credentials for workspace "${workspaceName}" — skipping`);
    return null;
  }
}

export function saveWorkspaceCredentials(
  workspaceName: string,
  provider: GitProvider,
  username: string,
  token: string
): void {
  validateName(workspaceName);
  const db = getDb();
  const encrypted = encrypt(token);
  const existing = db.prepare('SELECT id FROM git_credentials WHERE workspace_name = ?').get(workspaceName);
  if (existing) {
    db.prepare(
      `UPDATE git_credentials SET provider = ?, username = ?, encrypted_token = ?, updated_at = datetime('now') WHERE workspace_name = ?`
    ).run(provider, username, encrypted, workspaceName);
  } else {
    db.prepare(
      'INSERT INTO git_credentials (id, workspace_name, provider, username, encrypted_token) VALUES (?, ?, ?, ?, ?)'
    ).run(uuidv4(), workspaceName, provider, username, encrypted);
  }
}

export function deleteWorkspaceCredentials(workspaceName: string): void {
  validateName(workspaceName);
  getDb().prepare('DELETE FROM git_credentials WHERE workspace_name = ?').run(workspaceName);
}
