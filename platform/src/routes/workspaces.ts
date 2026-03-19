import { Router, Request, Response } from 'express';
import { authMiddleware } from '../security/auth.js';
import { getWorkspaceRoot, cloneRepo, initRepo } from '../git/manager.js';
import { readdirSync, statSync } from 'fs';
import { join } from 'path';

const router = Router();
router.use(authMiddleware);

router.get('/', (_req: Request, res: Response) => {
  try {
    const root = getWorkspaceRoot();
    const entries = readdirSync(root)
      .filter((name) => {
        try { return statSync(join(root, name)).isDirectory(); } catch { return false; }
      });
    res.json(entries);
  } catch (err: any) {
    res.status(500).json({ error: { code: 'IO_ERROR', message: err.message } });
  }
});

router.post('/', async (req: Request, res: Response) => {
  const { name, cloneUrl } = req.body;
  if (!name || typeof name !== 'string') {
    res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'name is required' } });
    return;
  }

  try {
    let path: string;
    if (cloneUrl) {
      path = await cloneRepo(cloneUrl, name);
    } else {
      path = await initRepo(name);
    }
    res.status(201).json({ name, path });
  } catch (err: any) {
    res.status(500).json({ error: { code: 'GIT_ERROR', message: err.message } });
  }
});

export default router;
