import { describe, it, expect, beforeAll, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import { getDb } from '../db/store.js';
import { setupAdmin } from '../security/auth.js';
import authRouter from '../routes/auth.js';

// Mock web-push so we don't need real VAPID keys / external calls
vi.mock('web-push', () => ({
  default: {
    generateVAPIDKeys: vi.fn(() => ({
      publicKey: 'test-public-key-base64',
      privateKey: 'test-private-key-base64',
    })),
    setVapidDetails: vi.fn(),
    sendNotification: vi.fn().mockResolvedValue({}),
  },
}));

const { default: pushRouter } = await import('../routes/push.js');

function createApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/auth', authRouter);
  app.use('/api/push', pushRouter);
  return app;
}

describe('Push Notification Routes', () => {
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

  describe('GET /api/push/vapid-public-key', () => {
    it('returns the VAPID public key', async () => {
      const res = await request(app)
        .get('/api/push/vapid-public-key')
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(200);
      expect(res.body.publicKey).toBeDefined();
      expect(typeof res.body.publicKey).toBe('string');
    });

    it('requires authentication', async () => {
      const res = await request(app).get('/api/push/vapid-public-key');
      expect(res.status).toBe(401);
    });
  });

  describe('POST /api/push/subscribe', () => {
    it('saves a subscription and returns ok', async () => {
      const res = await request(app)
        .post('/api/push/subscribe')
        .set('Authorization', `Bearer ${token}`)
        .send({
          endpoint: 'https://fcm.googleapis.com/fcm/send/test-endpoint',
          keys: { p256dh: 'test-p256dh-key', auth: 'test-auth-secret' },
        });
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
    });

    it('returns 400 when endpoint is missing', async () => {
      const res = await request(app)
        .post('/api/push/subscribe')
        .set('Authorization', `Bearer ${token}`)
        .send({ keys: { p256dh: 'key', auth: 'secret' } });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('BAD_REQUEST');
    });

    it('returns 400 when keys are missing', async () => {
      const res = await request(app)
        .post('/api/push/subscribe')
        .set('Authorization', `Bearer ${token}`)
        .send({ endpoint: 'https://example.com/push' });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('BAD_REQUEST');
    });

    it('requires authentication', async () => {
      const res = await request(app)
        .post('/api/push/subscribe')
        .send({
          endpoint: 'https://example.com/push',
          keys: { p256dh: 'key', auth: 'secret' },
        });
      expect(res.status).toBe(401);
    });
  });

  describe('DELETE /api/push/subscribe', () => {
    it('deletes a subscription and returns ok', async () => {
      const res = await request(app)
        .delete('/api/push/subscribe')
        .set('Authorization', `Bearer ${token}`)
        .send({ endpoint: 'https://fcm.googleapis.com/fcm/send/test-endpoint' });
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
    });

    it('returns 400 when endpoint is missing', async () => {
      const res = await request(app)
        .delete('/api/push/subscribe')
        .set('Authorization', `Bearer ${token}`)
        .send({});
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('BAD_REQUEST');
    });

    it('requires authentication', async () => {
      const res = await request(app).delete('/api/push/subscribe').send({ endpoint: 'https://example.com/push' });
      expect(res.status).toBe(401);
    });
  });
});
