import { describe, it, expect, beforeAll, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { getDb } from '../db/store.js';
import { setupAdmin } from '../security/auth.js';
import authRouter from '../routes/auth.js';

const TEST_WS_ROOT = '/tmp/srijan-test-files-ws-' + Date.now();
mkdirSync(join(TEST_WS_ROOT, 'myapp'), { recursive: true });
writeFileSync(join(TEST_WS_ROOT, 'myapp', 'hello.txt'), 'Hello World');
mkdirSync(join(TEST_WS_ROOT, 'myapp', 'subdir'), { recursive: true });
writeFileSync(join(TEST_WS_ROOT, 'myapp', 'subdir', 'nested.txt'), 'Nested file');
// Create a binary-ish file (with null byte)
writeFileSync(join(TEST_WS_ROOT, 'myapp', 'binary.bin'), Buffer.from([72, 101, 108, 0, 111]));

vi.mock('../git/manager.js', () => ({
  getWorkspaceRoot: vi.fn(() => TEST_WS_ROOT),
  cloneRepo: vi.fn(),
  initRepo: vi.fn(),
  getGit: vi.fn(),
}));

const { default: filesRouter } = await import('../routes/files.js');

function createApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/auth', authRouter);
  app.use('/api/workspaces', filesRouter);
  return app;
}

describe('Files API', () => {
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

  describe('GET /api/workspaces/:name/files', () => {
    it('returns directory entries for workspace root', async () => {
      const res = await request(app)
        .get('/api/workspaces/myapp/files')
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(200);
      expect(res.body.entries).toBeDefined();
      const names = res.body.entries.map((e: any) => e.name);
      expect(names).toContain('hello.txt');
      expect(names).toContain('subdir');
    });

    it('returns correct type for files and dirs', async () => {
      const res = await request(app)
        .get('/api/workspaces/myapp/files')
        .set('Authorization', `Bearer ${token}`);
      const file = res.body.entries.find((e: any) => e.name === 'hello.txt');
      const dir = res.body.entries.find((e: any) => e.name === 'subdir');
      expect(file.type).toBe('file');
      expect(dir.type).toBe('dir');
    });

    it('lists subdirectory entries', async () => {
      const res = await request(app)
        .get('/api/workspaces/myapp/files?path=subdir')
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(200);
      const names = res.body.entries.map((e: any) => e.name);
      expect(names).toContain('nested.txt');
    });

    it('rejects path traversal attempts', async () => {
      const res = await request(app)
        .get('/api/workspaces/myapp/files?path=../../etc')
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('PATH_TRAVERSAL');
    });

    it('returns 404 for non-existent path', async () => {
      const res = await request(app)
        .get('/api/workspaces/myapp/files?path=doesnotexist')
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(404);
    });

    it('requires authentication', async () => {
      const res = await request(app).get('/api/workspaces/myapp/files');
      expect(res.status).toBe(401);
    });
  });

  describe('GET /api/workspaces/:name/file', () => {
    it('returns file content', async () => {
      const res = await request(app)
        .get('/api/workspaces/myapp/file?path=hello.txt')
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(200);
      expect(res.body.content).toBe('Hello World');
    });

    it('returns nested file content', async () => {
      const res = await request(app)
        .get('/api/workspaces/myapp/file?path=subdir/nested.txt')
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(200);
      expect(res.body.content).toBe('Nested file');
    });

    it('rejects path traversal attempts', async () => {
      const res = await request(app)
        .get('/api/workspaces/myapp/file?path=../../etc/passwd')
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('PATH_TRAVERSAL');
    });

    it('returns 404 for non-existent file', async () => {
      const res = await request(app)
        .get('/api/workspaces/myapp/file?path=nope.txt')
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(404);
    });

    it('rejects binary files', async () => {
      const res = await request(app)
        .get('/api/workspaces/myapp/file?path=binary.bin')
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('BINARY_FILE');
    });

    it('returns 400 when path param is missing', async () => {
      const res = await request(app)
        .get('/api/workspaces/myapp/file')
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(400);
    });

    it('requires authentication', async () => {
      const res = await request(app).get('/api/workspaces/myapp/file?path=hello.txt');
      expect(res.status).toBe(401);
    });
  });
});
