import { describe, it, expect, vi, beforeAll } from 'vitest';
import request from 'supertest';
import express from 'express';
import { getDb } from '../db/store.js';
import { setupAdmin } from '../security/auth.js';
import authRouter from '../routes/auth.js';
import { v4 as uuidv4 } from 'uuid';

// Mock the Docker manager so tests don't need a Docker daemon
vi.mock('../docker/manager.js', () => ({
  listContainers: vi.fn().mockResolvedValue([
    {
      Id: 'abc123',
      Names: ['/my-app'],
      Image: 'my-app:latest',
      State: 'running',
      Status: 'Up 5 minutes',
      Ports: [{ PublicPort: 8080, PrivatePort: 3000, Type: 'tcp' }],
    },
  ]),
  getContainerLogs: vi.fn().mockResolvedValue('log line 1\nlog line 2'),
  startContainer: vi.fn().mockResolvedValue(undefined),
  stopContainer: vi.fn().mockResolvedValue(undefined),
}));

const containersRouter = await import('../routes/containers.js').then((m) => m.default);

function createApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/auth', authRouter);
  app.use('/api/containers', containersRouter);
  return app;
}

describe('Containers API', () => {
  let app: ReturnType<typeof createApp>;
  let token: string;

  beforeAll(async () => {
    const db = getDb();
    setupAdmin('testpass');
    app = createApp();

    // Register an app with the known container ID so it appears in the filtered list
    db.prepare(
      `INSERT OR IGNORE INTO apps (id, name, path, port, container_id, workspace_name, status) VALUES (?, ?, ?, ?, ?, ?, 'running')`
    ).run(uuidv4(), 'my-app', '/my-app', 8080, 'abc123', 'test-workspace');

    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: 'admin', password: 'testpass' });
    token = res.body.token;
  });

  it('should list containers (filtered to registered apps)', async () => {
    const res = await request(app)
      .get('/api/containers')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body[0].Id).toBe('abc123');
  });

  it('should filter containers by workspace', async () => {
    const res = await request(app)
      .get('/api/containers?workspace=test-workspace')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body[0].Id).toBe('abc123');
  });

  it('should return empty when workspace has no registered apps', async () => {
    const res = await request(app)
      .get('/api/containers?workspace=nonexistent')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(0);
  });

  it('should get container logs', async () => {
    const res = await request(app)
      .get('/api/containers/abc123/logs')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.logs).toContain('log line 1');
  });

  it('should start a container', async () => {
    const res = await request(app)
      .post('/api/containers/abc123/start')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.started).toBe(true);
  });

  it('should stop a container', async () => {
    const res = await request(app)
      .post('/api/containers/abc123/stop')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.stopped).toBe(true);
  });

  it('should require authentication', async () => {
    const res = await request(app).get('/api/containers');
    expect(res.status).toBe(401);
  });
});
