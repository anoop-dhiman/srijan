import { Router, Request, Response } from 'express';
import { authMiddleware } from '../security/auth.js';
import { listContainers, getContainerLogs, startContainer, stopContainer } from '../docker/manager.js';

const router = Router();
router.use(authMiddleware);

router.get('/', async (_req: Request, res: Response) => {
  try {
    const containers = await listContainers();
    res.json(containers);
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
