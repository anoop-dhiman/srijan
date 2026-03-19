import { v4 as uuidv4 } from 'uuid';
import { getDb } from '../db/store.js';
import { AgentEvent } from './events.js';

export interface Session {
  id: string;
  userId: string;
  title: string;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export function createSession(userId: string, title?: string): Session {
  const db = getDb();
  const id = uuidv4();
  db.prepare(
    `INSERT INTO sessions (id, user_id, title) VALUES (?, ?, ?)`
  ).run(id, userId, title || 'New Session');

  return db.prepare('SELECT * FROM sessions WHERE id = ?').get(id) as Session;
}

export function getSession(id: string): Session | undefined {
  const db = getDb();
  return db.prepare('SELECT * FROM sessions WHERE id = ?').get(id) as Session | undefined;
}

export function listSessions(userId: string): Session[] {
  const db = getDb();
  return db.prepare(
    'SELECT * FROM sessions WHERE user_id = ? ORDER BY updated_at DESC'
  ).all(userId) as Session[];
}

export function saveEvent(event: AgentEvent): void {
  const db = getDb();
  db.prepare(
    `INSERT INTO events (session_id, type, data) VALUES (?, ?, ?)`
  ).run(event.sessionId, event.type, JSON.stringify(event.data));
}

export function getSessionEvents(sessionId: string): AgentEvent[] {
  const db = getDb();
  return db.prepare(
    'SELECT * FROM events WHERE session_id = ? ORDER BY id ASC'
  ).all(sessionId) as AgentEvent[];
}

export function updateSessionTitle(id: string, title: string): void {
  const db = getDb();
  db.prepare(
    `UPDATE sessions SET title = ?, updated_at = datetime('now') WHERE id = ?`
  ).run(title, id);
}
