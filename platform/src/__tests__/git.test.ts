import { describe, it, expect, beforeAll, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import { getDb } from '../db/store.js';
import { setupAdmin } from '../security/auth.js';
import authRouter from '../routes/auth.js';

vi.mock('../git/manager.js', () => ({
  cloneRepo: vi.fn().mockResolvedValue('/workspaces/my-repo'),
  initRepo: vi.fn().mockResolvedValue('/workspaces/my-repo'),
  getGit: vi.fn().mockReturnValue({
    status: vi.fn().mockResolvedValue({
      current: 'main',
      modified: ['src/index.ts'],
      not_added: ['README.md'],
    }),
    pull: vi.fn().mockResolvedValue({
      summary: { changes: 2, insertions: 10, deletions: 3 },
    }),
  }),
  getWorkspaceRoot: vi.fn().mockReturnValue('/workspaces'),
}));

const { default: gitRouter } = await import('../routes/git.js');

function createApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/auth', authRouter);
  app.use('/api/git', gitRouter);
  return app;
}

describe('Git Routes', () => {
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

  describe('POST /api/git/clone', () => {
    it('should clone a repo and return path', async () => {
      const res = await request(app)
        .post('/api/git/clone')
        .set('Authorization', `Bearer ${token}`)
        .send({ url: 'https://github.com/example/repo.git', name: 'my-repo' });
      expect(res.status).toBe(200);
      expect(res.body.path).toBe('/workspaces/my-repo');
    });

    it('should require url and name', async () => {
      const res = await request(app)
        .post('/api/git/clone')
        .set('Authorization', `Bearer ${token}`)
        .send({ url: 'https://github.com/example/repo.git' });
      expect(res.status).toBe(400);
    });

    it('should reject without auth', async () => {
      const res = await request(app)
        .post('/api/git/clone')
        .send({ url: 'https://github.com/example/repo.git', name: 'my-repo' });
      expect(res.status).toBe(401);
    });
  });

  describe('POST /api/git/init', () => {
    it('should init a repo and return path', async () => {
      const res = await request(app)
        .post('/api/git/init')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'my-repo' });
      expect(res.status).toBe(200);
      expect(res.body.path).toBe('/workspaces/my-repo');
    });

    it('should require name', async () => {
      const res = await request(app)
        .post('/api/git/init')
        .set('Authorization', `Bearer ${token}`)
        .send({});
      expect(res.status).toBe(400);
    });
  });

  describe('GET /api/git/:name/status', () => {
    it('should return git status', async () => {
      const res = await request(app)
        .get('/api/git/my-repo/status')
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(200);
      expect(res.body.branch).toBe('main');
      expect(res.body.modified).toContain('src/index.ts');
      expect(res.body.untracked).toContain('README.md');
    });

    it('should reject without auth', async () => {
      const res = await request(app).get('/api/git/my-repo/status');
      expect(res.status).toBe(401);
    });
  });

  describe('POST /api/git/:name/pull', () => {
    it('should pull and return summary', async () => {
      const res = await request(app)
        .post('/api/git/my-repo/pull')
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(200);
      expect(res.body.summary).toBeDefined();
      expect(res.body.summary.changes).toBe(2);
    });

    it('should reject without auth', async () => {
      const res = await request(app).post('/api/git/my-repo/pull');
      expect(res.status).toBe(401);
    });
  });
});
