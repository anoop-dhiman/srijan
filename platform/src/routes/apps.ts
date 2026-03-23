import { Router, Request, Response, NextFunction } from 'express';
import { authMiddleware } from '../security/auth.js';
import { getDb } from '../db/store.js';
import { v4 as uuidv4 } from 'uuid';
import { addRoute, removeRoute } from '../docker/caddy.js';

const router = Router();

const APP_NAME_RE = /^[a-zA-Z0-9_-]{1,64}$/;

// Middleware for agent-initiated registration: validates X-Registration-Token against sessions table
function registrationAuth(req: Request, res: Response, next: NextFunction): void {
  const token = req.headers['x-registration-token'] as string | undefined;
  if (!token) {
    res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Missing registration token' } });
    return;
  }
  const db = getDb();
  const session = db.prepare(
    "SELECT id, workspace_name FROM sessions WHERE registration_token = ? AND status != 'deleted'"
  ).get(token) as { id: string; workspace_name: string | null } | undefined;
  if (!session) {
    res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Invalid registration token' } });
    return;
  }
  // Enforce workspace: if body specifies a workspaceName it must match the session's workspace
  const { workspaceName } = req.body;
  if (workspaceName && session.workspace_name && workspaceName !== session.workspace_name) {
    res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Workspace mismatch' } });
    return;
  }
  (req as any).registrationSession = session;
  next();
}

router.get('/', authMiddleware, (_req: Request, res: Response) => {
  const db = getDb();
  const apps = db.prepare('SELECT * FROM apps ORDER BY created_at DESC').all();
  res.json(apps);
});

router.post('/register', registrationAuth, async (req: Request, res: Response) => {
  const { name, path, port, containerId, workspaceName } = req.body;
  if (!name || !path || !port) {
    res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'name, path, and port required' } });
    return;
  }

  if (!APP_NAME_RE.test(name)) {
    res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'App name must be 1–64 alphanumeric/hyphen/underscore characters' } });
    return;
  }

  const portNum = Number(port);
  if (!Number.isInteger(portNum) || portNum < 1 || portNum > 65535) {
    res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'port must be an integer between 1 and 65535' } });
    return;
  }

  const appPath = path.startsWith('/') ? path : `/${path}`;
  const db = getDb();
  const id = uuidv4();

  try {
    // Register with Caddy first — if it fails we don't pollute the DB
    await addRoute(name, appPath, portNum);

    try {
      db.prepare(
        `INSERT INTO apps (id, name, path, port, container_id, workspace_name, status) VALUES (?, ?, ?, ?, ?, ?, 'running')`
      ).run(id, name, appPath, portNum, containerId || null, workspaceName || null);
    } catch (dbErr: any) {
      // Caddy route was added but DB insert failed — roll back the Caddy route
      await removeRoute(name).catch(() => {});
      if (dbErr.code === 'SQLITE_CONSTRAINT_UNIQUE' || dbErr.message?.includes('UNIQUE')) {
        res.status(409).json({ error: { code: 'CONFLICT', message: 'App name or path already exists' } });
      } else {
        throw dbErr;
      }
      return;
    }

    const domain = process.env.SRIJAN_DOMAIN || 'localhost';
    res.status(201).json({
      id,
      name,
      path: appPath,
      port: portNum,
      url: `https://${domain}${appPath}`,
    });
  } catch (err: any) {
    if (err.code === 'SQLITE_CONSTRAINT_UNIQUE' || err.message?.includes('UNIQUE')) {
      res.status(409).json({ error: { code: 'CONFLICT', message: 'App name or path already exists' } });
    } else {
      throw err;
    }
  }
});

router.delete('/:id', authMiddleware, async (req: Request, res: Response) => {
  const db = getDb();
  const app = db.prepare('SELECT * FROM apps WHERE id = ?').get(req.params.id) as any;
  if (!app) {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: 'App not found' } });
    return;
  }

  await removeRoute(app.name);
  db.prepare('DELETE FROM apps WHERE id = ?').run(req.params.id);
  res.json({ deleted: true });
});

export default router;
