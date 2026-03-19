import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import express from 'express';
import { getDb } from '../db/store.js';
import { setupAdmin } from '../security/auth.js';
import { createSession, saveEvent } from '../agent/session.js';
import authRouter from '../routes/auth.js';
import sessionsRouter from '../routes/sessions.js';

function createApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/auth', authRouter);
  app.use('/api/sessions', sessionsRouter);
  return app;
}

describe('Sessions Recording API', () => {
  let app: ReturnType<typeof createApp>;
  let token: string;
  let userId: string;
  let sessionId: string;

  beforeAll(async () => {
    getDb();
    setupAdmin('testpass');
    app = createApp();

    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: 'admin', password: 'testpass' });
    token = res.body.token;

    // Decode userId from token
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());
    userId = payload.userId;

    // Create a test session with events
    const session = createSession(userId, 'Test Session');
    sessionId = session.id;

    saveEvent({
      sessionId,
      type: 'user_message',
      data: { content: 'Hello agent' },
      id: 0,
      created_at: new Date().toISOString(),
    } as any);

    saveEvent({
      sessionId,
      type: 'agent_response',
      data: { content: 'Hello user', done: true },
      id: 0,
      created_at: new Date().toISOString(),
    } as any);
  });

  describe('GET /api/sessions/:id/recording', () => {
    it('returns session and events', async () => {
      const res = await request(app)
        .get(`/api/sessions/${sessionId}/recording`)
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(200);
      expect(res.body.session).toBeDefined();
      expect(res.body.session.id).toBe(sessionId);
      expect(Array.isArray(res.body.events)).toBe(true);
      expect(res.body.events.length).toBe(2);
      expect(res.body.totalCostUsd).toBeDefined();
    });

    it('returns events in order', async () => {
      const res = await request(app)
        .get(`/api/sessions/${sessionId}/recording`)
        .set('Authorization', `Bearer ${token}`);
      expect(res.body.events[0].type).toBe('user_message');
      expect(res.body.events[1].type).toBe('agent_response');
    });

    it('returns 404 for non-existent session', async () => {
      const res = await request(app)
        .get('/api/sessions/non-existent-id/recording')
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(404);
    });

    it('returns 403 for session owned by another user', async () => {
      // Create another user and session
      const db = getDb();
      const { v4: uuidv4 } = await import('uuid');
      const bcrypt = await import('bcryptjs');
      const otherId = uuidv4();
      db.prepare('INSERT INTO users (id, username, password_hash, role) VALUES (?, ?, ?, ?)').run(
        otherId, 'other-user-' + Date.now(), bcrypt.hashSync('pass', 10), 'user'
      );
      const otherSession = createSession(otherId, 'Other Session');

      const res = await request(app)
        .get(`/api/sessions/${otherSession.id}/recording`)
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(403);
    });

    it('requires authentication', async () => {
      const res = await request(app).get(`/api/sessions/${sessionId}/recording`);
      expect(res.status).toBe(401);
    });
  });
});
