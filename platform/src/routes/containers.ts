import { Router, Request, Response } from 'express';
import { authMiddleware } from '../security/auth.js';
import { listContainers, getContainerLogs, startContainer, stopContainer } from '../docker/manager.js';

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
