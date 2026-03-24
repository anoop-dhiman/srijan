import { v4 as uuidv4 } from 'uuid';
import { getDb } from '../db/store.js';
import { AgentEvent } from './events.js';
import { createLogger } from '../lib/logger.js';

const log = createLogger('session');

export interface Session {
  id: string;
  userId: string;
  title: string;
  status: string;
  workspaceName: string | null;
  createdAt: string;
  updatedAt: string;
}

const SESSION_COLS = `id, user_id as userId, title, status, workspace_name as workspaceName, created_at as createdAt, updated_at as updatedAt`;

export function createSession(userId: string, title?: string, workspaceName?: string): Session {
  const db = getDb();
  const id = uuidv4();
  db.prepare(
    `INSERT INTO sessions (id, user_id, title, workspace_name) VALUES (?, ?, ?, ?)`
  ).run(id, userId, title || 'New Session', workspaceName ?? null);

  return db.prepare(`SELECT ${SESSION_COLS} FROM sessions WHERE id = ?`).get(id) as Session;
}

export function getSession(id: string): Session | undefined {
  const db = getDb();
  return db.prepare(`SELECT ${SESSION_COLS} FROM sessions WHERE id = ?`).get(id) as Session | undefined;
}

export function listSessions(userId: string): Session[] {
  const db = getDb();
  return db.prepare(
    `SELECT ${SESSION_COLS} FROM sessions WHERE user_id = ? ORDER BY updated_at DESC`
  ).all(userId) as Session[];
}

export function deleteSession(id: string): void {
  const db = getDb();
  db.prepare('DELETE FROM events WHERE session_id = ?').run(id);
  db.prepare('DELETE FROM sessions WHERE id = ?').run(id);
}

export function saveEvent(event: AgentEvent): void {
  const db = getDb();
  const agentId = (event as any).agentId || null;
  if (agentId) {
    db.prepare(
      `INSERT INTO events (session_id, type, data, agent_id) VALUES (?, ?, ?, ?)`
    ).run(event.sessionId, event.type, JSON.stringify(event.data), agentId);
  } else {
    db.prepare(
      `INSERT INTO events (session_id, type, data) VALUES (?, ?, ?)`
    ).run(event.sessionId, event.type, JSON.stringify(event.data));
  }
}

export function getSessionEvents(sessionId: string): AgentEvent[] {
  const db = getDb();
  const rows = db.prepare(
    'SELECT * FROM events WHERE session_id = ? ORDER BY id ASC'
  ).all(sessionId) as any[];
  return rows.flatMap((row) => {
    let data: any = row.data;
    if (typeof row.data === 'string') {
      try {
        data = JSON.parse(row.data);
      } catch {
        log.warn({ eventId: row.id }, 'Skipping corrupt event: invalid JSON');
        return [];
      }
    }
    return [{ ...row, data }];
  }) as AgentEvent[];
}

export function getSessionsByWorkspace(name: string): { id: string }[] {
  const db = getDb();
  return db.prepare('SELECT id FROM sessions WHERE workspace_name = ?').all(name) as { id: string }[];
}

export function updateSessionTitle(id: string, title: string): void {
  const db = getDb();
  db.prepare(
    `UPDATE sessions SET title = ?, updated_at = datetime('now') WHERE id = ?`
  ).run(title, id);
}

export function createSessionAgent(params: {
  sessionId: string;
  name: string;
  displayName: string;
  roleId?: string | null;
  subdir?: string;
}): { id: string; session_id: string; name: string; display_name: string; role_id: string | null; subdir: string; claude_session_id: string | null; status: string; created_at: string } {
  const db = getDb();
  const id = uuidv4();
  db.prepare(
    `INSERT OR IGNORE INTO session_agents (id, session_id, name, display_name, role_id, subdir) VALUES (?, ?, ?, ?, ?, ?)`
  ).run(id, params.sessionId, params.name, params.displayName, params.roleId || null, params.subdir || '');
  return db.prepare('SELECT * FROM session_agents WHERE session_id = ? AND name = ?').get(params.sessionId, params.name) as any;
}

export function getSessionAgents(sessionId: string): any[] {
  const db = getDb();
  return db.prepare('SELECT * FROM session_agents WHERE session_id = ? ORDER BY created_at ASC').all(sessionId) as any[];
}

export function updateSessionAgentClaudeId(id: string, claudeSessionId: string): void {
  getDb().prepare('UPDATE session_agents SET claude_session_id = ? WHERE id = ?').run(claudeSessionId, id);
}

export function updateSessionAgentStatus(id: string, status: string): void {
  getDb().prepare(`UPDATE session_agents SET status = ? WHERE id = ?`).run(status, id);
}
