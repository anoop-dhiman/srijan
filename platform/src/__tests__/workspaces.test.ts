import { describe, it, expect, vi, beforeAll } from 'vitest';
import request from 'supertest';
import express from 'express';
import { mkdirSync } from 'fs';
import { join } from 'path';
import { getDb } from '../db/store.js';
import { setupAdmin } from '../security/auth.js';
import authRouter from '../routes/auth.js';

// Use a real temp directory so existsSync works naturally
const TEST_WS_ROOT = '/tmp/srijan-test-workspaces-' + Date.now();
mkdirSync(join(TEST_WS_ROOT, 'test-ws'), { recursive: true });

vi.mock('../docker/manager.js', () => ({
  listContainers: vi.fn().mockResolvedValue([]),
}));

vi.mock('../git/manager.js', () => ({
  getWorkspaceRoot: vi.fn().mockReturnValue(TEST_WS_ROOT),
  cloneRepo: vi.fn().mockResolvedValue(join(TEST_WS_ROOT, 'cloned-ws')),
  initRepo: vi.fn().mockResolvedValue(join(TEST_WS_ROOT, 'new-ws')),
  setRemote: vi.fn().mockResolvedValue(undefined),
  commitAll: vi.fn().mockResolvedValue(undefined),
  pushRepo: vi.fn().mockResolvedValue(undefined),
  deleteWorkspace: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../lib/gitAuth.js', () => ({
  detectProvider: vi.fn().mockReturnValue('generic'),
  saveWorkspaceCredentials: vi.fn(),
  deleteWorkspaceCredentials: vi.fn(),
}));

vi.mock('../agent/session.js', () => ({
  getSessionsByWorkspace: vi.fn().mockReturnValue([{ id: 'sess-1' }, { id: 'sess-2' }]),
  deleteSession: vi.fn(),
}));

vi.mock('../lib/workspaceTemplates.js', () => ({
  applyTemplate: vi.fn().mockResolvedValue(undefined),
  VALID_TEMPLATES: ['none', 'node', 'python', 'go', 'rust'],
}));

const { deleteWorkspaceCredentials, saveWorkspaceCredentials, detectProvider } = await import('../lib/gitAuth.js');
const { getSessionsByWorkspace, deleteSession } = await import('../agent/session.js');
const { deleteWorkspace, cloneRepo, initRepo, setRemote, commitAll, pushRepo } = await import('../git/manager.js');
const { applyTemplate } = await import('../lib/workspaceTemplates.js');
const workspacesRouter = await import('../routes/workspaces.js').then(m => m.default);

function createApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/auth', authRouter);
  app.use('/api/workspaces', workspacesRouter);
  return app;
}

describe('Workspaces API', () => {
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

  describe('GET /api/workspaces', () => {
    it('returns list of workspaces', async () => {
      const res = await request(app)
        .get('/api/workspaces')
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      // test-ws directory was created in beforeAll
      const ws = res.body.find((w: any) => w.name === 'test-ws');
      expect(ws).toBeDefined();
    });

    it('returns workspace info shape', async () => {
      const res = await request(app)
        .get('/api/workspaces')
        .set('Authorization', `Bearer ${token}`);
      const ws = res.body.find((w: any) => w.name === 'test-ws');
      expect(typeof ws.sessionCount).toBe('number');
      expect(typeof ws.runningContainerCount).toBe('number');
      // totalCostUsd is null or a number
      expect(ws.totalCostUsd === null || typeof ws.totalCostUsd === 'number').toBe(true);
    });

    it('requires authentication', async () => {
      const res = await request(app).get('/api/workspaces');
      expect(res.status).toBe(401);
    });
  });

  describe('POST /api/workspaces — validation', () => {
    it('returns 400 when name is missing', async () => {
      const res = await request(app)
        .post('/api/workspaces')
        .set('Authorization', `Bearer ${token}`)
        .send({});
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('BAD_REQUEST');
    });

    it('returns 400 when name is not a string', async () => {
      const res = await request(app)
        .post('/api/workspaces')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 123 });
      expect(res.status).toBe(400);
    });

    it('requires authentication', async () => {
      const res = await request(app)
        .post('/api/workspaces')
        .send({ name: 'new-ws' });
      expect(res.status).toBe(401);
    });
  });

  describe('POST /api/workspaces — init (new repo)', () => {
    it('creates workspace via initRepo when no cloneUrl', async () => {
      vi.mocked(initRepo).mockResolvedValueOnce(join(TEST_WS_ROOT, 'new-ws'));
      const res = await request(app)
        .post('/api/workspaces')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'new-ws' });
      expect(res.status).toBe(201);
      expect(res.body.name).toBe('new-ws');
      expect(initRepo).toHaveBeenCalledWith('new-ws');
    });

    it('sets remote, commits, and pushes when remoteUrl provided', async () => {
      vi.mocked(initRepo).mockResolvedValueOnce(join(TEST_WS_ROOT, 'new-remote-ws'));
      const res = await request(app)
        .post('/api/workspaces')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'new-remote-ws', remoteUrl: 'https://github.com/user/repo.git' });
      expect(res.status).toBe(201);
      expect(setRemote).toHaveBeenCalledWith('new-remote-ws', 'https://github.com/user/repo.git');
      expect(commitAll).toHaveBeenCalledWith('new-remote-ws', 'Initial commit');
      expect(pushRepo).toHaveBeenCalled();
    });

    it('returns 201 with pushError when push fails but init succeeded', async () => {
      vi.mocked(initRepo).mockResolvedValueOnce(join(TEST_WS_ROOT, 'push-fail-ws'));
      vi.mocked(pushRepo).mockRejectedValueOnce(new Error('Authentication failed'));
      const res = await request(app)
        .post('/api/workspaces')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'push-fail-ws', remoteUrl: 'https://github.com/user/repo.git' });
      expect(res.status).toBe(201);
      expect(res.body.pushError).toBe('Authentication failed');
    });
  });

  describe('POST /api/workspaces — templates', () => {
    it('calls applyTemplate with correct template when template field is provided', async () => {
      const wsPath = join(TEST_WS_ROOT, 'tpl-python-ws');
      vi.mocked(initRepo).mockResolvedValueOnce(wsPath);
      vi.mocked(applyTemplate).mockClear();
      const res = await request(app)
        .post('/api/workspaces')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'tpl-python-ws', template: 'python' });
      expect(res.status).toBe(201);
      expect(applyTemplate).toHaveBeenCalledWith(wsPath, 'python');
    });

    it('does not call applyTemplate when template is absent', async () => {
      vi.mocked(initRepo).mockResolvedValueOnce(join(TEST_WS_ROOT, 'no-tpl-ws'));
      vi.mocked(applyTemplate).mockClear();
      const res = await request(app)
        .post('/api/workspaces')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'no-tpl-ws' });
      expect(res.status).toBe(201);
      expect(applyTemplate).not.toHaveBeenCalled();
    });
  });

  describe('POST /api/workspaces — clone', () => {
    it('clones repo via cloneRepo when cloneUrl provided', async () => {
      vi.mocked(cloneRepo).mockResolvedValueOnce(join(TEST_WS_ROOT, 'cloned-ws'));
      const res = await request(app)
        .post('/api/workspaces')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'cloned-ws', cloneUrl: 'https://github.com/example/repo.git' });
      expect(res.status).toBe(201);
      expect(res.body.name).toBe('cloned-ws');
      expect(cloneRepo).toHaveBeenCalledWith(
        'https://github.com/example/repo.git',
        'cloned-ws',
        undefined
      );
    });

    it('saves git credentials and passes them to cloneRepo when gitToken provided', async () => {
      vi.mocked(cloneRepo).mockResolvedValueOnce(join(TEST_WS_ROOT, 'auth-clone-ws'));
      const res = await request(app)
        .post('/api/workspaces')
        .set('Authorization', `Bearer ${token}`)
        .send({
          name: 'auth-clone-ws',
          cloneUrl: 'https://github.com/example/private.git',
          gitProvider: 'github',
          gitUsername: 'alice',
          gitToken: 'ghp_token123',
        });
      expect(res.status).toBe(201);
      expect(saveWorkspaceCredentials).toHaveBeenCalledWith(
        'auth-clone-ws', 'github', 'alice', 'ghp_token123'
      );
      // cloneRepo called with credentials object
      expect(cloneRepo).toHaveBeenCalledWith(
        'https://github.com/example/private.git',
        'auth-clone-ws',
        expect.objectContaining({ token: 'ghp_token123' })
      );
    });

    it('does not save credentials when gitToken is absent', async () => {
      vi.mocked(cloneRepo).mockResolvedValueOnce(join(TEST_WS_ROOT, 'no-auth-ws'));
      vi.mocked(saveWorkspaceCredentials).mockClear();
      await request(app)
        .post('/api/workspaces')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'no-auth-ws', cloneUrl: 'https://github.com/example/public.git' });
      expect(saveWorkspaceCredentials).not.toHaveBeenCalled();
    });
  });

  describe('DELETE /api/workspaces/:name', () => {
    it('returns 401 without auth token', async () => {
      const res = await request(app).delete('/api/workspaces/test-ws');
      expect(res.status).toBe(401);
    });

    it('returns 404 when workspace does not exist', async () => {
      const res = await request(app)
        .delete('/api/workspaces/nonexistent-ws')
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('NOT_FOUND');
    });

    it('deletes workspace and cleans up in correct order', async () => {
      const callOrder: string[] = [];
      vi.mocked(deleteWorkspaceCredentials).mockImplementation(() => { callOrder.push('creds'); });
      vi.mocked(getSessionsByWorkspace).mockReturnValue([{ id: 'sess-1' }]);
      vi.mocked(deleteSession).mockImplementation(() => { callOrder.push('session'); });
      vi.mocked(deleteWorkspace).mockImplementation(async () => { callOrder.push('fs'); });

      const res = await request(app)
        .delete('/api/workspaces/test-ws')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.deleted).toBe(true);
      expect(callOrder).toEqual(['creds', 'session', 'fs']);
      expect(deleteWorkspaceCredentials).toHaveBeenCalledWith('test-ws');
      expect(deleteSession).toHaveBeenCalledWith('sess-1');
      expect(deleteWorkspace).toHaveBeenCalledWith('test-ws');
    });
  });
});
