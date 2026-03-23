import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import express from 'express';
import { getDb } from '../db/store.js';
import { setupAdmin } from '../security/auth.js';
import authRouter from '../routes/auth.js';
import configRouter from '../routes/config.js';
import secretsRouter from '../routes/secrets.js';
import appsRouter from '../routes/apps.js';

function createApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/auth', authRouter);
  app.use('/api/config', configRouter);
  app.use('/api/secrets', secretsRouter);
  app.use('/api/apps', appsRouter);
  app.get('/health', (_req, res) => res.json({ status: 'ok' }));
  return app;
}

describe('API Routes', () => {
  let app: ReturnType<typeof createApp>;
  let token: string;

  beforeAll(async () => {
    getDb();
    setupAdmin('testpass');
    app = createApp();

    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: 'admin', password: 'testpass' });
    token = res.body.token;
  });

  describe('GET /health', () => {
    it('should return ok', async () => {
      const res = await request(app).get('/health');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('ok');
    });
  });

  describe('POST /api/auth/login', () => {
    it('should login with valid credentials', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ username: 'admin', password: 'testpass' });
      expect(res.status).toBe(200);
      expect(res.body.token).toBeTruthy();
    });

    it('should reject invalid credentials', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ username: 'admin', password: 'wrong' });
      expect(res.status).toBe(401);
    });

    it('should require username and password', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({});
      expect(res.status).toBe(400);
    });
  });

  describe('GET /api/auth/me', () => {
    it('should return user with valid token', async () => {
      const res = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(200);
      expect(res.body.user.username).toBe('admin');
    });

    it('should reject without token', async () => {
      const res = await request(app).get('/api/auth/me');
      expect(res.status).toBe(401);
    });

    it('should reject invalid token', async () => {
      const res = await request(app)
        .get('/api/auth/me')
        .set('Authorization', 'Bearer invalid-token');
      expect(res.status).toBe(401);
    });
  });

  describe('Config API', () => {
    it('should save and read config', async () => {
      await request(app)
        .put('/api/config/llm')
        .set('Authorization', `Bearer ${token}`)
        .send({ value: { model: 'claude-sonnet-4-6', apiKey: 'test-key' } })
        .expect(200);

      const res = await request(app)
        .get('/api/config')
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(200);
      expect(res.body.llm.model).toBe('claude-sonnet-4-6');
    });

    it('should reject config without auth', async () => {
      const res = await request(app).get('/api/config');
      expect(res.status).toBe(401);
    });

    it('should reject config save without value', async () => {
      const res = await request(app)
        .put('/api/config/test')
        .set('Authorization', `Bearer ${token}`)
        .send({});
      expect(res.status).toBe(400);
    });
  });

  describe('Secrets API', () => {
    it('should create a secret', async () => {
      const res = await request(app)
        .post('/api/secrets')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'API_TEST_KEY_' + Date.now(), value: 'secret-value' });
      expect(res.status).toBe(201);
      expect(res.body.id).toBeTruthy();
      expect(res.body.name).toBeTruthy();
      expect(res.body.value).toBeUndefined(); // Value should not be returned
    });

    it('should list secrets without values', async () => {
      const res = await request(app)
        .get('/api/secrets')
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      for (const s of res.body) {
        expect(s.encrypted_value).toBeUndefined();
        expect(s.value).toBeUndefined();
      }
    });

    it('should reject duplicate secret names', async () => {
      const name = 'DUP_SECRET_' + Date.now();
      await request(app)
        .post('/api/secrets')
        .set('Authorization', `Bearer ${token}`)
        .send({ name, value: 'val1' })
        .expect(201);

      const res = await request(app)
        .post('/api/secrets')
        .set('Authorization', `Bearer ${token}`)
        .send({ name, value: 'val2' });
      expect(res.status).toBe(409);
    });

    it('should delete a secret', async () => {
      const createRes = await request(app)
        .post('/api/secrets')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'DELETE_ME_' + Date.now(), value: 'val' });

      const res = await request(app)
        .delete(`/api/secrets/${createRes.body.id}`)
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(200);
      expect(res.body.deleted).toBe(true);
    });

    it('should 404 on deleting non-existent secret', async () => {
      const res = await request(app)
        .delete('/api/secrets/non-existent-id')
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(404);
    });
  });

  describe('Apps API', () => {
    it('should list apps', async () => {
      const res = await request(app)
        .get('/api/apps')
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });

    it('should reject app registration without registration token', async () => {
      const res = await request(app)
        .post('/api/apps/register')
        .send({ name: 'test-app', path: '/test-app', port: 3000 });
      expect(res.status).toBe(401);
    });

    it('should reject app registration with invalid registration token', async () => {
      const res = await request(app)
        .post('/api/apps/register')
        .set('X-Registration-Token', 'invalid-token')
        .send({ name: 'test-app', path: '/test-app', port: 3000 });
      expect(res.status).toBe(401);
    });

    it('should reject app registration with valid token but missing fields', async () => {
      // Insert a session with a known registration token
      const db = getDb();
      const regToken = 'test-reg-token-' + Date.now();
      const sessionId = 'test-session-' + Date.now();
      const userId = db.prepare('SELECT id FROM users WHERE username = ?').get('admin') as { id: string };
      db.prepare(
        `INSERT INTO sessions (id, user_id, title, status, registration_token) VALUES (?, ?, 'Test', 'active', ?)`
      ).run(sessionId, userId.id, regToken);

      const res = await request(app)
        .post('/api/apps/register')
        .set('X-Registration-Token', regToken)
        .send({ name: 'test-app' }); // missing path and port
      expect(res.status).toBe(400);

      db.prepare('DELETE FROM sessions WHERE id = ?').run(sessionId);
    });
  });
});
