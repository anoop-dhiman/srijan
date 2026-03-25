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
// Create a tracked file for diff tests
writeFileSync(join(TEST_WS_ROOT, 'myapp', 'tracked.txt'), 'Current content');

vi.mock('../git/manager.js', () => ({
  getWorkspaceRoot: vi.fn(() => TEST_WS_ROOT),
  cloneRepo: vi.fn(),
  initRepo: vi.fn(),
  getGit: vi.fn(),
}));

// Mock execSync for diff endpoint
vi.mock('child_process', () => ({
  execSync: vi.fn((cmd: string) => {
    if (cmd.includes('HEAD:tracked.txt')) return 'Original content';
    throw new Error('not a git repository');
  }),
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

    it('rejects URL-encoded path traversal (%2e%2e%2f)', async () => {
      const res = await request(app)
        .get('/api/workspaces/myapp/files?path=%2e%2e%2fetc')
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('PATH_TRAVERSAL');
    });

    it('rejects double URL-encoded path traversal (%252e%252e%252f)', async () => {
      const res = await request(app)
        .get('/api/workspaces/myapp/files?path=%252e%252e%252fetc')
        .set('Authorization', `Bearer ${token}`);
      // Either 400 (caught) or 404 (decoded path doesn't exist) is acceptable
      expect([400, 404]).toContain(res.status);
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

  describe('GET /api/workspaces/:name/files/tree', () => {
    it('returns all files recursively in a single call', async () => {
      const res = await request(app)
        .get('/api/workspaces/myapp/files/tree')
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(200);
      expect(res.body.files).toBeDefined();
      const paths = res.body.files.map((f: any) => f.path);
      expect(paths).toContain('subdir/nested.txt');
    });

    it('respects maxDepth query param', async () => {
      const res = await request(app)
        .get('/api/workspaces/myapp/files/tree?maxDepth=0')
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(200);
      // depth 0 = only root-level files, no subdirectory contents
      const paths = res.body.files.map((f: any) => f.path);
      expect(paths).not.toContain('subdir/nested.txt');
    });

    it('returns 404 for non-existent workspace', async () => {
      const res = await request(app)
        .get('/api/workspaces/nonexistent/files/tree')
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(404);
    });

    it('requires authentication', async () => {
      const res = await request(app).get('/api/workspaces/myapp/files/tree');
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

    it('rejects URL-encoded path traversal (%2e%2e%2f)', async () => {
      const res = await request(app)
        .get('/api/workspaces/myapp/file?path=%2e%2e%2fetc%2fpasswd')
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

  describe('PUT /api/workspaces/:name/file', () => {
    it('writes file content and returns ok', async () => {
      const res = await request(app)
        .put('/api/workspaces/myapp/file?path=hello.txt')
        .set('Authorization', `Bearer ${token}`)
        .send({ content: 'Updated content' });
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);

      // Verify the file was actually written
      const readRes = await request(app)
        .get('/api/workspaces/myapp/file?path=hello.txt')
        .set('Authorization', `Bearer ${token}`);
      expect(readRes.body.content).toBe('Updated content');
    });

    it('rejects path traversal attempts', async () => {
      const res = await request(app)
        .put('/api/workspaces/myapp/file?path=../../etc/passwd')
        .set('Authorization', `Bearer ${token}`)
        .send({ content: 'evil' });
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('PATH_TRAVERSAL');
    });

    it('returns 400 when path param is missing', async () => {
      const res = await request(app)
        .put('/api/workspaces/myapp/file')
        .set('Authorization', `Bearer ${token}`)
        .send({ content: 'some content' });
      expect(res.status).toBe(400);
    });

    it('returns 400 when content is not a string', async () => {
      const res = await request(app)
        .put('/api/workspaces/myapp/file?path=hello.txt')
        .set('Authorization', `Bearer ${token}`)
        .send({ content: 12345 });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('BAD_REQUEST');
    });

    it('requires authentication', async () => {
      const res = await request(app)
        .put('/api/workspaces/myapp/file?path=hello.txt')
        .send({ content: 'test' });
      expect(res.status).toBe(401);
    });
  });

  describe('GET /api/workspaces/:name/diff', () => {
    it('returns original and current content for tracked file', async () => {
      const res = await request(app)
        .get('/api/workspaces/myapp/diff?path=tracked.txt')
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(200);
      expect(res.body.original).toBe('Original content');
      expect(res.body.current).toBe('Current content');
    });

    it('returns empty original when file is not tracked in git', async () => {
      const res = await request(app)
        .get('/api/workspaces/myapp/diff?path=hello.txt')
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(200);
      expect(res.body.original).toBe('');
      expect(typeof res.body.current).toBe('string');
    });

    it('rejects path traversal', async () => {
      const res = await request(app)
        .get('/api/workspaces/myapp/diff?path=../../etc/passwd')
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('PATH_TRAVERSAL');
    });

    it('returns 404 for non-existent file', async () => {
      const res = await request(app)
        .get('/api/workspaces/myapp/diff?path=doesnotexist.txt')
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(404);
    });

    it('returns 400 when path is missing', async () => {
      const res = await request(app)
        .get('/api/workspaces/myapp/diff')
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(400);
    });

    it('requires authentication', async () => {
      const res = await request(app).get('/api/workspaces/myapp/diff?path=hello.txt');
      expect(res.status).toBe(401);
    });
  });
});
