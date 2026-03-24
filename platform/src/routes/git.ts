import { Router, Request, Response } from 'express';
import { authMiddleware } from '../security/auth.js';
import { cloneRepo, initRepo, getGit, setRemote, pushRepo, pullRepo, getGitIdentity, setGitIdentity, getDetailedStatus, stageFiles, unstageFiles, commitChanges } from '../git/manager.js';
import {
  detectProvider,
  getWorkspaceCredentials,
  saveWorkspaceCredentials,
  deleteWorkspaceCredentials,
  type GitProvider,
} from '../lib/gitAuth.js';

const router = Router();
router.use(authMiddleware);

const VALID_PROVIDERS: GitProvider[] = ['github', 'azure', 'generic'];
const GIT_URL_RE = /^(https?:\/\/|git@)/i;

function isValidGitUrl(url: string): boolean {
  return GIT_URL_RE.test(url);
}

router.post('/clone', async (req: Request, res: Response) => {
  const { url, name } = req.body;
  if (!url || !name) {
    res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'url and name required' } });
    return;
  }
  if (!isValidGitUrl(url)) {
    res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Invalid git URL format' } });
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
    const name = req.params.name as string;
    const git = getGit(name);
    const [status, remotes, files] = await Promise.all([
      git.status(),
      git.getRemotes(true),
      getDetailedStatus(name),
    ]);
    const remoteUrl = remotes.find(r => r.name === 'origin')?.refs?.push ?? null;
    res.json({
      branch: status.current,
      modified: status.modified,
      untracked: status.not_added,
      remoteUrl,
      files,
    });
  } catch (err: any) {
    res.status(500).json({ error: { code: 'GIT_ERROR', message: err.message } });
  }
});

router.post('/:name/pull', async (req: Request, res: Response) => {
  try {
    const name = req.params.name as string;
    const creds = getWorkspaceCredentials(name) ?? undefined;
    const result = await pullRepo(name, creds);
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
    await setRemote(req.params.name as string, url);
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: { code: 'GIT_ERROR', message: err.message } });
  }
});

router.post('/:name/push', async (req: Request, res: Response) => {
  try {
    const name = req.params.name as string;
    const creds = getWorkspaceCredentials(name) ?? undefined;
    await pushRepo(name, creds);
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: { code: 'GIT_ERROR', message: err.message } });
  }
});

// --- Git identity (user.name / user.email) ---

router.get('/:name/identity', async (req: Request, res: Response) => {
  try {
    const identity = await getGitIdentity(req.params.name as string);
    res.json(identity);
  } catch (err: any) {
    res.status(500).json({ error: { code: 'GIT_ERROR', message: err.message } });
  }
});

router.put('/:name/identity', async (req: Request, res: Response) => {
  const { name, email } = req.body;
  if (!name && !email) {
    res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'name or email required' } });
    return;
  }
  try {
    await setGitIdentity(req.params.name as string, { name: name || '', email: email || '' });
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: { code: 'GIT_ERROR', message: err.message } });
  }
});

// --- Git credential management ---

router.get('/:name/credentials', (req: Request, res: Response) => {
  const creds = getWorkspaceCredentials(req.params.name as string);
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
    // Normalize unknown providers to 'generic'
    const resolvedProvider: GitProvider = (VALID_PROVIDERS.includes(provider) ? provider : 'generic') as GitProvider;
    saveWorkspaceCredentials(req.params.name as string, resolvedProvider, username || '', token);
    res.json({ ok: true, provider: resolvedProvider });
  } catch (err: any) {
    res.status(500).json({ error: { code: 'DB_ERROR', message: err.message } });
  }
});

router.delete('/:name/credentials', (req: Request, res: Response) => {
  deleteWorkspaceCredentials(req.params.name as string);
  res.json({ ok: true });
});

router.post('/:name/stage', async (req: Request, res: Response) => {
  try {
    const name = req.params.name as string;
    const paths: string[] = Array.isArray(req.body.paths) ? req.body.paths : [];
    await stageFiles(name, paths);
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: { code: 'GIT_ERROR', message: err.message } });
  }
});

router.post('/:name/unstage', async (req: Request, res: Response) => {
  try {
    const name = req.params.name as string;
    const paths: string[] = Array.isArray(req.body.paths) ? req.body.paths : [];
    if (paths.length === 0) {
      res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'paths array is required and must be non-empty' } });
      return;
    }
    await unstageFiles(name, paths);
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: { code: 'GIT_ERROR', message: err.message } });
  }
});

router.post('/:name/commit', async (req: Request, res: Response) => {
  const { message } = req.body;
  if (!message || typeof message !== 'string' || message.trim() === '') {
    res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'message is required' } });
    return;
  }
  try {
    await commitChanges(req.params.name as string, message);
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: { code: 'GIT_ERROR', message: err.message } });
  }
});

export { detectProvider };
export default router;
