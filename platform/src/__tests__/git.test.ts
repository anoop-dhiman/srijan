import { describe, it, expect, beforeAll, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import { getDb } from '../db/store.js';
import { setupAdmin } from '../security/auth.js';
import authRouter from '../routes/auth.js';

vi.mock('../git/manager.js', () => ({
  cloneRepo: vi.fn().mockResolvedValue('/workspaces/my-repo'),
  initRepo: vi.fn().mockResolvedValue('/workspaces/my-repo'),
  setRemote: vi.fn().mockResolvedValue(undefined),
  pushRepo: vi.fn().mockResolvedValue(undefined),
  pullRepo: vi.fn().mockResolvedValue({ summary: { changes: 2, insertions: 10, deletions: 3 } }),
  getGit: vi.fn().mockReturnValue({
    status: vi.fn().mockResolvedValue({
      current: 'main',
      modified: ['src/index.ts'],
      not_added: ['README.md'],
    }),
    getRemotes: vi.fn().mockResolvedValue([
      { name: 'origin', refs: { push: 'https://github.com/example/repo.git' } },
    ]),
  }),
  getWorkspaceRoot: vi.fn().mockReturnValue('/workspaces'),
  setGitIdentity: vi.fn().mockResolvedValue(undefined),
  getGitIdentity: vi.fn().mockResolvedValue({ name: 'Test User', email: 'test@example.com' }),
}));

// gitAuth uses real DB — credential routes are tested with actual DB interactions
const { default: gitRouter } = await import('../routes/git.js');
const { pushRepo, setRemote, setGitIdentity, getGitIdentity } = await import('../git/manager.js');

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
      expect(res.body.remoteUrl).toBe('https://github.com/example/repo.git');
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

  describe('POST /api/git/:name/remote', () => {
    it('should set remote and return ok', async () => {
      const res = await request(app)
        .post('/api/git/my-repo/remote')
        .set('Authorization', `Bearer ${token}`)
        .send({ url: 'https://github.com/example/repo.git' });
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(setRemote).toHaveBeenCalledWith('my-repo', 'https://github.com/example/repo.git');
    });

    it('should return 400 when url is missing', async () => {
      const res = await request(app)
        .post('/api/git/my-repo/remote')
        .set('Authorization', `Bearer ${token}`)
        .send({});
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('BAD_REQUEST');
    });

    it('should reject without auth', async () => {
      const res = await request(app)
        .post('/api/git/my-repo/remote')
        .send({ url: 'https://github.com/example/repo.git' });
      expect(res.status).toBe(401);
    });
  });

  describe('POST /api/git/:name/push', () => {
    it('should push and return ok', async () => {
      const res = await request(app)
        .post('/api/git/my-repo/push')
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(pushRepo).toHaveBeenCalled();
    });

    it('should reject without auth', async () => {
      const res = await request(app).post('/api/git/my-repo/push');
      expect(res.status).toBe(401);
    });
  });

  describe('GET /api/git/:name/identity', () => {
    it('should return git identity', async () => {
      const res = await request(app)
        .get('/api/git/my-repo/identity')
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(200);
      expect(res.body.name).toBe('Test User');
      expect(res.body.email).toBe('test@example.com');
      expect(getGitIdentity).toHaveBeenCalledWith('my-repo');
    });

    it('should reject without auth', async () => {
      const res = await request(app).get('/api/git/my-repo/identity');
      expect(res.status).toBe(401);
    });
  });

  describe('PUT /api/git/:name/identity', () => {
    it('should set git identity', async () => {
      const res = await request(app)
        .put('/api/git/my-repo/identity')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'New User', email: 'new@example.com' });
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(setGitIdentity).toHaveBeenCalledWith('my-repo', { name: 'New User', email: 'new@example.com' });
    });

    it('should return 400 when both name and email are missing', async () => {
      const res = await request(app)
        .put('/api/git/my-repo/identity')
        .set('Authorization', `Bearer ${token}`)
        .send({});
      expect(res.status).toBe(400);
    });

    it('should reject without auth', async () => {
      const res = await request(app)
        .put('/api/git/my-repo/identity')
        .send({ name: 'Test', email: 'test@test.com' });
      expect(res.status).toBe(401);
    });
  });

  describe('Credential routes', () => {
    const credWs = 'cred-test-ws-' + Date.now();

    describe('GET /api/git/:name/credentials', () => {
      it('returns configured=false when no credentials saved', async () => {
        const res = await request(app)
          .get(`/api/git/${credWs}/credentials`)
          .set('Authorization', `Bearer ${token}`);
        expect(res.status).toBe(200);
        expect(res.body.configured).toBe(false);
      });

      it('requires authentication', async () => {
        const res = await request(app).get(`/api/git/${credWs}/credentials`);
        expect(res.status).toBe(401);
      });
    });

    describe('POST /api/git/:name/credentials', () => {
      it('saves credentials and returns ok with resolved provider', async () => {
        const res = await request(app)
          .post(`/api/git/${credWs}/credentials`)
          .set('Authorization', `Bearer ${token}`)
          .send({ provider: 'github', username: 'alice', token: 'ghp_testtoken' });
        expect(res.status).toBe(200);
        expect(res.body.ok).toBe(true);
        expect(res.body.provider).toBe('github');
      });

      it('returns 400 when token is missing', async () => {
        const res = await request(app)
          .post(`/api/git/${credWs}/credentials`)
          .set('Authorization', `Bearer ${token}`)
          .send({ provider: 'github', username: 'alice' });
        expect(res.status).toBe(400);
        expect(res.body.error.code).toBe('BAD_REQUEST');
      });

      it('normalizes unknown provider to generic', async () => {
        const ws2 = 'cred-generic-ws-' + Date.now();
        const res = await request(app)
          .post(`/api/git/${ws2}/credentials`)
          .set('Authorization', `Bearer ${token}`)
          .send({ provider: 'bitbucket', username: 'bob', token: 'tok' });
        expect(res.status).toBe(200);
        expect(res.body.provider).toBe('generic');
      });

      it('requires authentication', async () => {
        const res = await request(app)
          .post(`/api/git/${credWs}/credentials`)
          .send({ provider: 'github', username: 'alice', token: 'tok' });
        expect(res.status).toBe(401);
      });
    });

    describe('GET /api/git/:name/credentials (after save)', () => {
      it('returns configured=true with provider and username but no token', async () => {
        const res = await request(app)
          .get(`/api/git/${credWs}/credentials`)
          .set('Authorization', `Bearer ${token}`);
        expect(res.status).toBe(200);
        expect(res.body.configured).toBe(true);
        expect(res.body.provider).toBe('github');
        expect(res.body.username).toBe('alice');
        expect(res.body.token).toBeUndefined();
      });
    });

    describe('DELETE /api/git/:name/credentials', () => {
      it('deletes credentials and returns ok', async () => {
        const res = await request(app)
          .delete(`/api/git/${credWs}/credentials`)
          .set('Authorization', `Bearer ${token}`);
        expect(res.status).toBe(200);
        expect(res.body.ok).toBe(true);
      });

      it('credentials are gone after delete', async () => {
        const res = await request(app)
          .get(`/api/git/${credWs}/credentials`)
          .set('Authorization', `Bearer ${token}`);
        expect(res.body.configured).toBe(false);
      });

      it('requires authentication', async () => {
        const res = await request(app).delete(`/api/git/${credWs}/credentials`);
        expect(res.status).toBe(401);
      });
    });
  });
});
