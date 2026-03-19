import { Router, Request, Response } from 'express';
import { authMiddleware } from '../security/auth.js';
import { cloneRepo, initRepo, getGit } from '../git/manager.js';

const router = Router();
router.use(authMiddleware);

router.post('/clone', async (req: Request, res: Response) => {
  const { url, name } = req.body;
  if (!url || !name) {
    res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'url and name required' } });
    return;
  }
  try {
    const path = await cloneRepo(url, name);
    res.json({ path });
  } catch (err: any) {
    res.status(500).json({ error: { code: 'GIT_ERROR', message: err.message } });
  }
});

router.post('/init', async (req: Request, res: Response) => {
  const { name } = req.body;
  if (!name) {
    res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'name required' } });
    return;
  }
  try {
    const path = await initRepo(name);
    res.json({ path });
  } catch (err: any) {
    res.status(500).json({ error: { code: 'GIT_ERROR', message: err.message } });
  }
});

router.get('/:name/status', async (req: Request, res: Response) => {
  try {
    const git = getGit(req.params.name);
    const status = await git.status();
    res.json({
      branch: status.current,
      modified: status.modified,
      untracked: status.not_added,
    });
  } catch (err: any) {
    res.status(500).json({ error: { code: 'GIT_ERROR', message: err.message } });
  }
});

router.post('/:name/pull', async (req: Request, res: Response) => {
  try {
    const git = getGit(req.params.name);
    const result = await git.pull();
    res.json({ summary: result.summary });
  } catch (err: any) {
    res.status(500).json({ error: { code: 'GIT_ERROR', message: err.message } });
  }
});

export default router;
