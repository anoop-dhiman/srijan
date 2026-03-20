import { describe, it, expect } from 'vitest';
import request from 'supertest';
import express from 'express';
import { requestIdMiddleware } from '../middleware/requestId.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function buildApp() {
  const app = express();
  app.use(requestIdMiddleware);
  app.get('/test', (_req, res) => res.json({ ok: true }));
  return app;
}

describe('requestIdMiddleware', () => {
  it('adds X-Request-Id header to responses', async () => {
    const res = await request(buildApp()).get('/test');
    expect(res.headers['x-request-id']).toBeDefined();
  });

  it('echoes back the provided X-Request-Id header', async () => {
    const myId = 'my-custom-request-id-123';
    const res = await request(buildApp()).get('/test').set('X-Request-Id', myId);
    expect(res.headers['x-request-id']).toBe(myId);
  });

  it('auto-generates a UUID when no X-Request-Id is provided', async () => {
    const res = await request(buildApp()).get('/test');
    expect(res.headers['x-request-id']).toMatch(UUID_RE);
  });

  it('different requests without explicit ID get different IDs', async () => {
    const app = buildApp();
    const [r1, r2] = await Promise.all([
      request(app).get('/test'),
      request(app).get('/test'),
    ]);
    expect(r1.headers['x-request-id']).toBeDefined();
    expect(r2.headers['x-request-id']).toBeDefined();
    expect(r1.headers['x-request-id']).not.toBe(r2.headers['x-request-id']);
  });
});
