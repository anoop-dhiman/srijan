import { v4 as uuidv4 } from 'uuid';
import { getDb } from '../db/store.js';
import { AgentEvent } from './events.js';

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
  db.prepare(
    `INSERT INTO events (session_id, type, data) VALUES (?, ?, ?)`
  ).run(event.sessionId, event.type, JSON.stringify(event.data));
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
        console.warn(`[session] Skipping corrupt event id=${row.id}: invalid JSON`);
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
