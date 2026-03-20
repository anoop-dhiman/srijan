import { Router, Request, Response } from 'express';
import { authMiddleware } from '../security/auth.js';
import { getWorkspaceRoot, cloneRepo, initRepo, setRemote, commitAll, pushRepo } from '../git/manager.js';
import { detectProvider, saveWorkspaceCredentials, type GitProvider } from '../lib/gitAuth.js';
import { getDb } from '../db/store.js';
import { listContainers } from '../docker/manager.js';
import { readdirSync, statSync } from 'fs';
import { join } from 'path';

const router = Router();
router.use(authMiddleware);

router.get('/', async (_req: Request, res: Response) => {
  try {
    const root = getWorkspaceRoot();
    const names = readdirSync(root).filter((name) => {
      try { return statSync(join(root, name)).isDirectory(); } catch { return false; }
    });

    const db = getDb();

    // Session count + last activity + total cost per workspace
    const sessionStats = db.prepare(`
      SELECT
        s.workspace_name,
        COUNT(DISTINCT s.id) as sessionCount,
        MAX(s.updated_at) as lastActivityAt,
        COALESCE(SUM(t.cost_usd), 0) as totalCost
      FROM sessions s
      LEFT JOIN token_usage t ON t.session_id = s.id
      WHERE s.workspace_name IS NOT NULL
      GROUP BY s.workspace_name
    `).all() as { workspace_name: string; sessionCount: number; lastActivityAt: string | null; totalCost: number }[];

    // Count running Docker containers per workspace by name-match
    // (docker-compose names containers as <workspace>-<service>-<index>)
    const containerCountByWorkspace = new Map<string, number>();
    try {
      const allContainers = await listContainers();
      for (const name of names) {
        const count = allContainers.filter(c =>
          c.State === 'running' &&
          c.Names.some(n => n.replace(/^\//, '').toLowerCase().includes(name.toLowerCase()))
        ).length;
        containerCountByWorkspace.set(name, count);
      }
    } catch { /* Docker unavailable — default to 0 */ }

    const statsMap = new Map<string, { sessionCount: number; lastActivityAt: string | null; totalCost: number }>();
    for (const s of sessionStats) {
      statsMap.set(s.workspace_name, {
        sessionCount: s.sessionCount,
        lastActivityAt: s.lastActivityAt,
        totalCost: s.totalCost,
      });
    }

    const result = names.map((name) => {
      const stats = statsMap.get(name) || { sessionCount: 0, lastActivityAt: null, totalCost: 0 };
      return {
        name,
        sessionCount: stats.sessionCount,
        runningContainerCount: containerCountByWorkspace.get(name) ?? 0,
        totalCostUsd: stats.totalCost > 0 ? stats.totalCost : null,
        lastActivityAt: stats.lastActivityAt,
      };
    });

    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: { code: 'IO_ERROR', message: err.message } });
  }
});

router.post('/', async (req: Request, res: Response) => {
  const { name, cloneUrl, remoteUrl, gitProvider, gitUsername, gitToken } = req.body;
  if (!name || typeof name !== 'string') {
    res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'name is required' } });
    return;
  }

  // Persist credentials if provided
  const hasCreds = typeof gitToken === 'string' && gitToken.length > 0;
  if (hasCreds) {
    const targetUrl = cloneUrl || remoteUrl || '';
    const provider: GitProvider = (['github', 'azure', 'generic'].includes(gitProvider)
      ? gitProvider
      : detectProvider(targetUrl)) as GitProvider;
    saveWorkspaceCredentials(name, provider, gitUsername || '', gitToken);
  }

  const creds = hasCreds ? { provider: gitProvider, username: gitUsername || '', token: gitToken } : undefined;

  try {
    let path: string;
    if (cloneUrl) {
      path = await cloneRepo(cloneUrl, name, creds);
    } else {
      path = await initRepo(name);
      if (remoteUrl) {
        await setRemote(name, remoteUrl);
        await commitAll(name, 'Initial commit');
        try {
          await pushRepo(name, creds);
        } catch (pushErr: any) {
          return res.status(201).json({ name, path, pushError: pushErr.message });
        }
      }
    }
    res.status(201).json({ name, path });
  } catch (err: any) {
    res.status(500).json({ error: { code: 'GIT_ERROR', message: err.message } });
  }
});

export default router;
