import { describe, it, expect, vi, beforeAll } from 'vitest';
import request from 'supertest';
import express from 'express';
import { mkdirSync } from 'fs';
import { join } from 'path';
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
  cloneRepo: vi.fn().mockResolvedValue(join(TEST_WS_ROOT, 'test-ws')),
  initRepo: vi.fn().mockResolvedValue(join(TEST_WS_ROOT, 'test-ws')),
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

const { deleteWorkspaceCredentials } = await import('../lib/gitAuth.js');
const { getSessionsByWorkspace, deleteSession } = await import('../agent/session.js');
const { deleteWorkspace } = await import('../git/manager.js');
const workspacesRouter = await import('../routes/workspaces.js').then(m => m.default);

function createApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/auth', authRouter);
  app.use('/api/workspaces', workspacesRouter);
  return app;
}

describe('Workspaces DELETE API', () => {
  let app: ReturnType<typeof createApp>;
  let token: string;

  beforeAll(async () => {
    setupAdmin('testpass');
    app = createApp();
    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: 'admin', password: 'testpass' });
    token = res.body.token;
  });

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
