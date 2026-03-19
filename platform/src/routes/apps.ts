import { Router, Request, Response } from 'express';
import { authMiddleware } from '../security/auth.js';
import { getDb } from '../db/store.js';
import { v4 as uuidv4 } from 'uuid';
import { addRoute, removeRoute } from '../docker/caddy.js';

const router = Router();
router.use(authMiddleware);

router.get('/', (_req: Request, res: Response) => {
  const db = getDb();
  const apps = db.prepare('SELECT * FROM apps ORDER BY created_at DESC').all();
  res.json(apps);
});

router.post('/register', async (req: Request, res: Response) => {
  const { name, path, port, containerId, workspaceName } = req.body;
  if (!name || !path || !port) {
    res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'name, path, and port required' } });
    return;
  }

  const appPath = path.startsWith('/') ? path : `/${path}`;
  const db = getDb();
  const id = uuidv4();

  try {
    db.prepare(
      `INSERT INTO apps (id, name, path, port, container_id, workspace_name, status) VALUES (?, ?, ?, ?, ?, ?, 'running')`
    ).run(id, name, appPath, port, containerId || null, workspaceName || null);

    await addRoute(name, appPath, port);

    const domain = process.env.SRIJAN_DOMAIN || 'localhost';
    res.status(201).json({
      id,
      name,
      path: appPath,
      port,
      url: `https://${domain}${appPath}`,
    });
  } catch (err: any) {
    if (err.message?.includes('UNIQUE')) {
      res.status(409).json({ error: { code: 'CONFLICT', message: 'App name or path already exists' } });
    } else {
      throw err;
    }
  }
});

router.delete('/:id', async (req: Request, res: Response) => {
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
