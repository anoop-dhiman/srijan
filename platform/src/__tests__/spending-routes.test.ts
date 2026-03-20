import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import express from 'express';
import { getDb } from '../db/store.js';
import { setupAdmin, createUser } from '../security/auth.js';
import authRouter from '../routes/auth.js';
import spendingRouter from '../routes/spending.js';
import usersRouter from '../routes/users.js';
import workspacesRouter from '../routes/workspaces.js';

function createApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/auth', authRouter);
  app.use('/api/spending', spendingRouter);
  app.use('/api/users', usersRouter);
  app.use('/api/workspaces', workspacesRouter);
  return app;
}

describe('Spending Routes', () => {
  let app: ReturnType<typeof createApp>;
  let adminToken: string;
  let adminId: string;
  let userToken: string;
  let userId: string;

  beforeAll(async () => {
    getDb();
    setupAdmin('testpass1');
    app = createApp();

    const adminRes = await request(app)
      .post('/api/auth/login')
      .send({ username: 'admin', password: 'testpass1' });
    adminToken = adminRes.body.token;
    const adminPayload = JSON.parse(Buffer.from(adminToken.split('.')[1], 'base64').toString());
    adminId = adminPayload.userId;

    // Create a regular user for non-admin tests
    try {
      createUser('spendtestuser', 'testpass1', 'user');
    } catch { /* may already exist */ }
    const userRes = await request(app)
      .post('/api/auth/login')
      .send({ username: 'spendtestuser', password: 'testpass1' });
    userToken = userRes.body.token;
    const userPayload = JSON.parse(Buffer.from(userToken.split('.')[1], 'base64').toString());
    userId = userPayload.userId;
  });

  describe('GET /api/spending/me', () => {
    it('requires auth', async () => {
      const res = await request(app).get('/api/spending/me');
      expect(res.status).toBe(401);
    });

    it('returns spending shape', async () => {
      const res = await request(app)
        .get('/api/spending/me')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(typeof res.body.spent_usd).toBe('number');
      expect('limit_usd' in res.body).toBe(true);
      expect('percent' in res.body).toBe(true);
      expect('window_start' in res.body).toBe(true);
    });
  });

  describe('GET /api/spending/users', () => {
    it('requires admin', async () => {
      const res = await request(app)
        .get('/api/spending/users')
        .set('Authorization', `Bearer ${userToken}`);
      expect(res.status).toBe(403);
    });

    it('admin gets list of users with spending', async () => {
      const res = await request(app)
        .get('/api/spending/users')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      const admin = res.body.find((u: any) => u.username === 'admin');
      expect(admin).toBeDefined();
      expect(typeof admin.spent_usd).toBe('number');
    });
  });

  describe('GET /api/spending/workspaces', () => {
    it('requires admin', async () => {
      const res = await request(app)
        .get('/api/spending/workspaces')
        .set('Authorization', `Bearer ${userToken}`);
      expect(res.status).toBe(403);
    });

    it('admin gets workspaces spending list', async () => {
      const res = await request(app)
        .get('/api/spending/workspaces')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });
  });

  describe('PUT /api/users/:id/spending-limit', () => {
    it('requires admin', async () => {
      const res = await request(app)
        .put(`/api/users/${userId}/spending-limit`)
        .set('Authorization', `Bearer ${userToken}`)
        .send({ spending_limit_usd: 10 });
      expect(res.status).toBe(403);
    });

    it('admin can set spending limit', async () => {
      const res = await request(app)
        .put(`/api/users/${userId}/spending-limit`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ spending_limit_usd: 25.50 });
      expect(res.status).toBe(200);
      expect(res.body.spending_limit_usd).toBe(25.50);
    });

    it('admin can reset limit to null', async () => {
      const res = await request(app)
        .put(`/api/users/${userId}/spending-limit`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ spending_limit_usd: null });
      expect(res.status).toBe(200);
      expect(res.body.spending_limit_usd).toBeNull();
    });

    it('rejects negative values', async () => {
      const res = await request(app)
        .put(`/api/users/${userId}/spending-limit`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ spending_limit_usd: -5 });
      expect(res.status).toBe(400);
    });

    it('rejects non-numeric values', async () => {
      const res = await request(app)
        .put(`/api/users/${userId}/spending-limit`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ spending_limit_usd: 'abc' });
      expect(res.status).toBe(400);
    });
  });
});
