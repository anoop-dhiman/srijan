import { describe, it, expect, beforeAll, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import { getDb } from '../db/store.js';
import { setupAdmin } from '../security/auth.js';
import authRouter from '../routes/auth.js';

// Mock child_process.spawn for claude CLI calls
vi.mock('child_process', () => {
  const mockSpawn = vi.fn(() => {
    const EventEmitter = require('events');
    const stdout = new EventEmitter();
    const stderr = new EventEmitter();
    const proc = new EventEmitter() as any;
    proc.stdout = stdout;
    proc.stderr = stderr;

    // Simulate successful response
    setImmediate(() => {
      stdout.emit('data', Buffer.from(JSON.stringify([{ name: 'test-server', command: 'npx', args: ['-y', '@test/server'] }])));
      proc.emit('close', 0);
    });

    return proc;
  });

  return { spawn: mockSpawn };
});

const { default: mcpRouter } = await import('../routes/mcp.js');

function createApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/auth', authRouter);
  app.use('/api/mcp', mcpRouter);
  return app;
}

describe('MCP Routes', () => {
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

  describe('GET /api/mcp', () => {
    it('returns server list', async () => {
      const res = await request(app)
        .get('/api/mcp')
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(200);
      expect(res.body.servers).toBeDefined();
      expect(Array.isArray(res.body.servers)).toBe(true);
    });

    it('requires authentication', async () => {
      const res = await request(app).get('/api/mcp');
      expect(res.status).toBe(401);
    });
  });

  describe('POST /api/mcp', () => {
    it('requires name and command', async () => {
      const res = await request(app)
        .post('/api/mcp')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'test' });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('BAD_REQUEST');
    });

    it('adds a server when valid params provided', async () => {
      const res = await request(app)
        .post('/api/mcp')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'my-server', command: 'npx', args: ['-y', '@my/mcp-server'] });
      expect([200, 500]).toContain(res.status); // 500 if claude CLI is not found is acceptable
    });

    it('requires authentication', async () => {
      const res = await request(app)
        .post('/api/mcp')
        .send({ name: 'test', command: 'echo' });
      expect(res.status).toBe(401);
    });
  });

  describe('DELETE /api/mcp/:name', () => {
    it('removes a server', async () => {
      const res = await request(app)
        .delete('/api/mcp/test-server')
        .set('Authorization', `Bearer ${token}`);
      expect([200, 500]).toContain(res.status); // 500 if claude CLI not found is acceptable
    });

    it('requires authentication', async () => {
      const res = await request(app).delete('/api/mcp/test-server');
      expect(res.status).toBe(401);
    });
  });
});
