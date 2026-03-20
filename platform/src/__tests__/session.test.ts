import { describe, it, expect, beforeAll } from 'vitest';
import { getDb } from '../db/store.js';
import { setupAdmin } from '../security/auth.js';
import { createSession, getSession, listSessions, saveEvent, getSessionEvents, updateSessionTitle, deleteSession, getSessionsByWorkspace } from '../agent/session.js';
import { createEvent } from '../agent/events.js';

describe('Sessions', () => {
  let userId: string;

  beforeAll(() => {
    getDb();
    setupAdmin('testpass');
    const db = getDb();
    const user = db.prepare('SELECT id FROM users WHERE username = ?').get('admin') as any;
    userId = user.id;
  });

  it('should create a session', () => {
    const session = createSession(userId, 'Test Session');
    expect(session.id).toBeTruthy();
    expect(session.title).toBe('Test Session');
    expect(session.status).toBe('active');
  });

  it('should create session with default title', () => {
    const session = createSession(userId);
    expect(session.title).toBe('New Session');
  });

  it('should get session by id', () => {
    const session = createSession(userId, 'Find Me');
    const found = getSession(session.id);
    expect(found).toBeDefined();
    expect(found!.title).toBe('Find Me');
  });

  it('should return undefined for non-existent session', () => {
    const found = getSession('non-existent-id');
    expect(found).toBeUndefined();
  });

  it('should list sessions for user', () => {
    const sessions = listSessions(userId);
    expect(sessions.length).toBeGreaterThan(0);
    // Should be ordered by updated_at DESC
    for (let i = 1; i < sessions.length; i++) {
      const prev = (sessions[i - 1] as any).updated_at || (sessions[i - 1] as any).updatedAt;
      const curr = (sessions[i] as any).updated_at || (sessions[i] as any).updatedAt;
      expect(prev >= curr).toBe(true);
    }
  });

  it('should update session title', () => {
    const session = createSession(userId, 'Old Title');
    updateSessionTitle(session.id, 'New Title');
    const updated = getSession(session.id);
    expect(updated!.title).toBe('New Title');
  });

  it('should save and retrieve events', () => {
    const session = createSession(userId, 'Event Session');

    const event1 = createEvent(session.id, 'user_message', { content: 'Hello' });
    saveEvent(event1);

    const event2 = createEvent(session.id, 'agent_response', { content: 'Hi there!', done: true });
    saveEvent(event2);

    const events = getSessionEvents(session.id);
    expect(events.length).toBe(2);
    expect(events[0].type).toBe('user_message');
    expect(events[1].type).toBe('agent_response');
  });

  it('should create session with workspaceName', () => {
    const session = createSession(userId, 'WS Session', 'my-workspace');
    expect(session.workspaceName).toBe('my-workspace');
    const found = getSession(session.id);
    expect(found!.workspaceName).toBe('my-workspace');
  });

  it('should create session with null workspaceName by default', () => {
    const session = createSession(userId, 'No WS');
    expect(session.workspaceName).toBeNull();
  });

  it('should get sessions by workspace', () => {
    const wsName = 'filter-workspace-' + Date.now();
    const s1 = createSession(userId, 'WS S1', wsName);
    const s2 = createSession(userId, 'WS S2', wsName);
    createSession(userId, 'Other WS', 'different-workspace');

    const sessions = getSessionsByWorkspace(wsName);
    const ids = sessions.map(s => s.id);
    expect(ids).toContain(s1.id);
    expect(ids).toContain(s2.id);
    expect(ids).not.toContain('unrelated');
  });

  it('should return empty array for workspace with no sessions', () => {
    const sessions = getSessionsByWorkspace('nonexistent-workspace-' + Date.now());
    expect(sessions).toEqual([]);
  });

  it('should delete a session and its events', () => {
    const session = createSession(userId, 'Delete Me');
    const event = createEvent(session.id, 'user_message', { content: 'hello' });
    saveEvent(event);

    // Verify session and events exist
    expect(getSession(session.id)).toBeDefined();
    const eventsBefore = getSessionEvents(session.id);
    expect(eventsBefore.length).toBe(1);

    deleteSession(session.id);

    // Session is gone
    expect(getSession(session.id)).toBeUndefined();

    // Events are gone too (cascade)
    const eventsAfter = getSessionEvents(session.id);
    expect(eventsAfter.length).toBe(0);
  });

  it('deleteSession is a noop for non-existent id', () => {
    expect(() => deleteSession('nonexistent-id-' + Date.now())).not.toThrow();
  });
});
