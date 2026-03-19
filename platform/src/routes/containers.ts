import { Router, Request, Response } from 'express';
import { authMiddleware } from '../security/auth.js';
import { listContainers, getContainerLogs, startContainer, stopContainer } from '../docker/manager.js';
import { getDb } from '../db/store.js';

const router = Router();
router.use(authMiddleware);

router.get('/', async (req: Request, res: Response) => {
  try {
    const workspace = req.query.workspace as string | undefined;
    const db = getDb();
    const rows = workspace
      ? db.prepare('SELECT container_id FROM apps WHERE container_id IS NOT NULL AND workspace_name = ?').all(workspace) as { container_id: string }[]
      : db.prepare('SELECT container_id FROM apps WHERE container_id IS NOT NULL').all() as { container_id: string }[];

    const knownIds = new Set(rows.map(r => r.container_id));
    const all = await listContainers();
    res.json(all.filter(c => knownIds.has(c.Id)));
  } catch (err: any) {
    res.status(500).json({ error: { code: 'DOCKER_ERROR', message: err.message } });
  }
});

router.get('/:id/logs', async (req: Request, res: Response) => {
  const tail = parseInt(req.query.tail as string || '100', 10);
  try {
    const logs = await getContainerLogs(req.params.id, tail);
    res.json({ logs });
  } catch (err: any) {
    res.status(500).json({ error: { code: 'DOCKER_ERROR', message: err.message } });
  }
});

router.post('/:id/start', async (req: Request, res: Response) => {
  try {
    await startContainer(req.params.id);
    res.json({ started: true });
  } catch (err: any) {
    res.status(500).json({ error: { code: 'DOCKER_ERROR', message: err.message } });
  }
});

router.post('/:id/stop', async (req: Request, res: Response) => {
  try {
    await stopContainer(req.params.id);
    res.json({ stopped: true });
  } catch (err: any) {
    res.status(500).json({ error: { code: 'DOCKER_ERROR', message: err.message } });
  }
});

export default router;
