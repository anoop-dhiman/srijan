import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import express from 'express';
import { getDb } from '../db/store.js';
import { setupAdmin } from '../security/auth.js';
import authRouter from '../routes/auth.js';
import costRouter from '../routes/cost.js';
import { createSession } from '../agent/session.js';

function createApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/auth', authRouter);
  app.use('/api/sessions/:id/cost', costRouter);
  return app;
}

describe('Cost Tracking', () => {
  let app: ReturnType<typeof createApp>;
  let token: string;
  let sessionId: string;

  beforeAll(async () => {
    const db = getDb();
    setupAdmin('testpass');
    app = createApp();

    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: 'admin', password: 'testpass' });
    token = res.body.token;

    const user = db.prepare('SELECT id FROM users WHERE username = ?').get('admin') as any;
    const session = createSession(user.id, 'Cost Test Session');
    sessionId = session.id;
  });

  it('should return zero cost for a new session', async () => {
    const res = await request(app)
      .get(`/api/sessions/${sessionId}/cost`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(Number(res.body.input_tokens)).toBe(0);
    expect(Number(res.body.output_tokens)).toBe(0);
  });

  it('should aggregate token usage after inserting records', async () => {
    const db = getDb();
    db.prepare(
      `INSERT INTO token_usage (session_id, input_tokens, output_tokens, cost_usd, model)
       VALUES (?, ?, ?, ?, ?)`
    ).run(sessionId, 100, 200, 0.005, 'claude-sonnet-4-6');

    db.prepare(
      `INSERT INTO token_usage (session_id, input_tokens, output_tokens, cost_usd, model)
       VALUES (?, ?, ?, ?, ?)`
    ).run(sessionId, 50, 75, 0.002, 'claude-sonnet-4-6');

    const res = await request(app)
      .get(`/api/sessions/${sessionId}/cost`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(Number(res.body.input_tokens)).toBe(150);
    expect(Number(res.body.output_tokens)).toBe(275);
    expect(Number(res.body.cost_usd)).toBeCloseTo(0.007, 5);
  });

  it('should handle null cost_usd (Vertex AI sessions)', async () => {
    const db = getDb();
    const user = db.prepare('SELECT id FROM users WHERE username = ?').get('admin') as any;
    const vertexSession = createSession(user.id, 'No Cost Session');

    db.prepare(
      `INSERT INTO token_usage (session_id, input_tokens, output_tokens, cost_usd, model)
       VALUES (?, ?, ?, ?, ?)`
    ).run(vertexSession.id, 500, 1000, null, 'claude-sonnet-4-6');

    const res = await request(app)
      .get(`/api/sessions/${vertexSession.id}/cost`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(Number(res.body.input_tokens)).toBe(500);
    expect(res.body.cost_usd).toBeNull();
  });

  it('should require authentication', async () => {
    const res = await request(app).get(`/api/sessions/${sessionId}/cost`);
    expect(res.status).toBe(401);
  });
});
