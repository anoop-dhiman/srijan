import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import express from 'express';
import { getDb } from '../db/store.js';
import { setupAdmin } from '../security/auth.js';
import authRouter from '../routes/auth.js';
import usersRouter from '../routes/users.js';

function createApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/auth', authRouter);
  app.use('/api/users', usersRouter);
  return app;
}

describe('Users API', () => {
  let app: ReturnType<typeof createApp>;
  let adminToken: string;
  let adminId: string;

  beforeAll(async () => {
    getDb();
    setupAdmin('testpass');
    app = createApp();

    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: 'admin', password: 'testpass' });
    adminToken = res.body.token;
    const payload = JSON.parse(Buffer.from(adminToken.split('.')[1], 'base64').toString());
    adminId = payload.userId;
  });

  describe('GET /api/users', () => {
    it('admin can list users', async () => {
      const res = await request(app)
        .get('/api/users')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.some((u: any) => u.username === 'admin')).toBe(true);
    });

    it('returns user fields without password', async () => {
      const res = await request(app)
        .get('/api/users')
        .set('Authorization', `Bearer ${adminToken}`);
      const admin = res.body.find((u: any) => u.username === 'admin');
      expect(admin.id).toBeDefined();
      expect(admin.username).toBe('admin');
      expect(admin.role).toBe('admin');
      expect(admin.createdAt).toBeDefined();
      expect(admin.password_hash).toBeUndefined();
    });

    it('requires authentication', async () => {
      const res = await request(app).get('/api/users');
      expect(res.status).toBe(401);
    });
  });

  describe('POST /api/users', () => {
    it('admin can create a user', async () => {
      const username = 'testuser-' + Date.now();
      const res = await request(app)
        .post('/api/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ username, password: 'pass123', role: 'user' });
      expect(res.status).toBe(201);
      expect(res.body.id).toBeDefined();
    });

    it('rejects missing fields', async () => {
      const res = await request(app)
        .post('/api/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ username: 'foo' });
      expect(res.status).toBe(400);
    });

    it('rejects invalid role', async () => {
      const res = await request(app)
        .post('/api/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ username: 'foo', password: 'bar', role: 'superuser' });
      expect(res.status).toBe(400);
    });

    it('rejects duplicate username', async () => {
      const username = 'dupuser-' + Date.now();
      await request(app)
        .post('/api/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ username, password: 'pass', role: 'user' })
        .expect(201);

      const res = await request(app)
        .post('/api/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ username, password: 'pass2', role: 'user' });
      expect(res.status).toBe(409);
    });
  });

  describe('DELETE /api/users/:id', () => {
    it('admin can delete another user', async () => {
      const username = 'deleteMe-' + Date.now();
      const createRes = await request(app)
        .post('/api/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ username, password: 'pass', role: 'user' });
      const newId = createRes.body.id;

      const res = await request(app)
        .delete(`/api/users/${newId}`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(res.body.deleted).toBe(true);
    });

    it('cannot delete own account', async () => {
      const res = await request(app)
        .delete(`/api/users/${adminId}`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(400);
    });
  });

  describe('PUT /api/users/:id/password', () => {
    it('admin can change password of another user', async () => {
      const username = 'pwduser-' + Date.now();
      const createRes = await request(app)
        .post('/api/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ username, password: 'oldpass', role: 'user' });
      const newId = createRes.body.id;

      const res = await request(app)
        .put(`/api/users/${newId}/password`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ password: 'newpass' });
      expect(res.status).toBe(200);
    });

    it('non-admin cannot change another user password', async () => {
      const username = 'reguser-' + Date.now();
      const createRes = await request(app)
        .post('/api/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ username, password: 'pass', role: 'user' });
      const newId = createRes.body.id;

      // Login as the new user
      const loginRes = await request(app)
        .post('/api/auth/login')
        .send({ username, password: 'pass' });
      const userToken = loginRes.body.token;

      // Try to change admin's password
      const res = await request(app)
        .put(`/api/users/${adminId}/password`)
        .set('Authorization', `Bearer ${userToken}`)
        .send({ password: 'hacked' });
      expect(res.status).toBe(403);
    });

    it('user can change their own password', async () => {
      const username = 'selfpwduser-' + Date.now();
      const createRes = await request(app)
        .post('/api/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ username, password: 'pass', role: 'user' });
      const newId = createRes.body.id;

      const loginRes = await request(app)
        .post('/api/auth/login')
        .send({ username, password: 'pass' });
      const userToken = loginRes.body.token;

      const res = await request(app)
        .put(`/api/users/${newId}/password`)
        .set('Authorization', `Bearer ${userToken}`)
        .send({ password: 'newpass' });
      expect(res.status).toBe(200);
    });
  });

  describe('Non-admin access', () => {
    let userToken: string;

    beforeAll(async () => {
      const username = 'nonadmin-' + Date.now();
      await request(app)
        .post('/api/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ username, password: 'pass', role: 'user' });

      const loginRes = await request(app)
        .post('/api/auth/login')
        .send({ username, password: 'pass' });
      userToken = loginRes.body.token;
    });

    it('non-admin cannot list users', async () => {
      const res = await request(app)
        .get('/api/users')
        .set('Authorization', `Bearer ${userToken}`);
      expect(res.status).toBe(403);
    });

    it('non-admin cannot create users', async () => {
      const res = await request(app)
        .post('/api/users')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ username: 'newuser', password: 'pass', role: 'user' });
      expect(res.status).toBe(403);
    });

    it('non-admin cannot delete users', async () => {
      const res = await request(app)
        .delete(`/api/users/${adminId}`)
        .set('Authorization', `Bearer ${userToken}`);
      expect(res.status).toBe(403);
    });
  });
});
