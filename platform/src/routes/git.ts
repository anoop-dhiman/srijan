import { Router, Request, Response } from 'express';
import { authMiddleware } from '../security/auth.js';
import { cloneRepo, initRepo, getGit, setRemote, pushRepo, pullRepo } from '../git/manager.js';
import {
  detectProvider,
  getWorkspaceCredentials,
  saveWorkspaceCredentials,
  deleteWorkspaceCredentials,
  type GitProvider,
} from '../lib/gitAuth.js';

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
    const [status, remotes] = await Promise.all([git.status(), git.getRemotes(true)]);
    const remoteUrl = remotes.find(r => r.name === 'origin')?.refs?.push ?? null;
    res.json({
      branch: status.current,
      modified: status.modified,
      untracked: status.not_added,
      remoteUrl,
    });
  } catch (err: any) {
    res.status(500).json({ error: { code: 'GIT_ERROR', message: err.message } });
  }
});

router.post('/:name/pull', async (req: Request, res: Response) => {
  try {
    const creds = getWorkspaceCredentials(req.params.name) ?? undefined;
    const result = await pullRepo(req.params.name, creds);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: { code: 'GIT_ERROR', message: err.message } });
  }
});

router.post('/:name/remote', async (req: Request, res: Response) => {
  const { url } = req.body;
  if (!url) {
    res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'url is required' } });
    return;
  }
  try {
    await setRemote(req.params.name, url);
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: { code: 'GIT_ERROR', message: err.message } });
  }
});

router.post('/:name/push', async (req: Request, res: Response) => {
  try {
    const creds = getWorkspaceCredentials(req.params.name) ?? undefined;
    await pushRepo(req.params.name, creds);
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: { code: 'GIT_ERROR', message: err.message } });
  }
});

// --- Git credential management ---

router.get('/:name/credentials', (req: Request, res: Response) => {
  const creds = getWorkspaceCredentials(req.params.name);
  if (!creds) {
    res.json({ configured: false });
    return;
  }
  // Never return the token — only metadata
  res.json({ configured: true, provider: creds.provider, username: creds.username });
});

router.post('/:name/credentials', (req: Request, res: Response) => {
  const { provider, username, token } = req.body;
  if (!token) {
    res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'token is required' } });
    return;
  }
  try {
    const resolvedProvider: GitProvider = (['github', 'azure', 'generic'].includes(provider)
      ? provider
      : 'generic') as GitProvider;
    saveWorkspaceCredentials(req.params.name, resolvedProvider, username || '', token);
    res.json({ ok: true, provider: resolvedProvider });
  } catch (err: any) {
    res.status(500).json({ error: { code: 'DB_ERROR', message: err.message } });
  }
});

router.delete('/:name/credentials', (req: Request, res: Response) => {
  deleteWorkspaceCredentials(req.params.name);
  res.json({ ok: true });
});

export { detectProvider };
export default router;
