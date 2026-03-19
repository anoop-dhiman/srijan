import { Router, Request, Response } from 'express';
import { authMiddleware } from '../security/auth.js';
import { getWorkspaceRoot, cloneRepo, initRepo } from '../git/manager.js';
import { getDb } from '../db/store.js';
import { readdirSync, statSync } from 'fs';
import { join } from 'path';

const router = Router();
router.use(authMiddleware);

router.get('/', (_req: Request, res: Response) => {
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

    // Registered apps with container_id per workspace
    const containerStats = db.prepare(`
      SELECT workspace_name, COUNT(*) as containerCount
      FROM apps
      WHERE container_id IS NOT NULL AND workspace_name IS NOT NULL
      GROUP BY workspace_name
    `).all() as { workspace_name: string; containerCount: number }[];

    const statsMap = new Map<string, { sessionCount: number; lastActivityAt: string | null; totalCost: number; containerCount: number }>();
    for (const s of sessionStats) {
      statsMap.set(s.workspace_name, {
        sessionCount: s.sessionCount,
        lastActivityAt: s.lastActivityAt,
        totalCost: s.totalCost,
        containerCount: 0,
      });
    }
    for (const c of containerStats) {
      const existing = statsMap.get(c.workspace_name) || { sessionCount: 0, lastActivityAt: null, totalCost: 0, containerCount: 0 };
      statsMap.set(c.workspace_name, { ...existing, containerCount: c.containerCount });
    }

    const result = names.map((name) => {
      const stats = statsMap.get(name) || { sessionCount: 0, lastActivityAt: null, totalCost: 0, containerCount: 0 };
      return {
        name,
        sessionCount: stats.sessionCount,
        runningContainerCount: stats.containerCount,
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
