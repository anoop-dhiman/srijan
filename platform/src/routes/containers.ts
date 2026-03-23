import { Router, Request, Response } from 'express';
import { authMiddleware, requireAdmin } from '../security/auth.js';
import { listContainers, getContainerLogs, startContainer, stopContainer } from '../docker/manager.js';

const CONTAINER_ID_RE = /^[a-zA-Z0-9][a-zA-Z0-9_.-]+$/;

const router = Router();
router.use(authMiddleware);

router.get('/', async (req: Request, res: Response) => {
  try {
    const workspace = req.query.workspace as string | undefined;
    const all = await listContainers();

    if (!workspace) {
      res.json(all);
      return;
    }

    // docker-compose prefixes container names with the project (workspace) name,
    // so filtering by name substring is sufficient.
    const filtered = all.filter(c =>
      c.Names.some(n => n.replace(/^\//, '').toLowerCase().includes(workspace.toLowerCase()))
    );

    res.json(filtered);
  } catch (err: any) {
    res.status(500).json({ error: { code: 'DOCKER_ERROR', message: err.message } });
  }
});

router.get('/:id/logs', async (req: Request, res: Response) => {
  const id = req.params.id as string;
  if (!CONTAINER_ID_RE.test(id)) {
    res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Invalid container id' } });
    return;
  }
  const tail = Math.min(Math.max(parseInt(req.query.tail as string || '100', 10) || 100, 1), 10000);
  try {
    const logs = await getContainerLogs(id, tail);
    res.json({ logs });
  } catch (err: any) {
    res.status(500).json({ error: { code: 'DOCKER_ERROR', message: err.message } });
  }
});

router.post('/:id/start', requireAdmin, async (req: Request, res: Response) => {
  const id = req.params.id as string;
  if (!CONTAINER_ID_RE.test(id)) {
    res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Invalid container id' } });
    return;
  }
  try {
    await startContainer(id);
    res.json({ started: true });
  } catch (err: any) {
    res.status(500).json({ error: { code: 'DOCKER_ERROR', message: err.message } });
  }
});

router.post('/:id/stop', requireAdmin, async (req: Request, res: Response) => {
  const id = req.params.id as string;
  if (!CONTAINER_ID_RE.test(id)) {
    res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Invalid container id' } });
    return;
  }
  try {
    await stopContainer(id);
    res.json({ stopped: true });
  } catch (err: any) {
    res.status(500).json({ error: { code: 'DOCKER_ERROR', message: err.message } });
  }
});

export default router;
