import { Router, Request, Response } from 'express';
import { authMiddleware, requireAdmin, listUsers } from '../security/auth.js';
import { getDb } from '../db/store.js';
import { getMonthWindowStart, getUserSpending, getWorkspaceSpending } from '../lib/spending.js';
import { readdirSync, statSync } from 'fs';
import { getWorkspaceRoot } from '../git/manager.js';
import { join } from 'path';

const router = Router();
router.use(authMiddleware);

router.get('/me', (req: Request, res: Response) => {
  const user = (req as any).user;
  const windowStart = getMonthWindowStart();
  const spending = getUserSpending(user.userId, windowStart);
  res.json({
    spent_usd: spending.spent_usd,
    limit_usd: spending.limit_usd,
    percent: spending.percent,
    window_start: windowStart,
    reset_at: null,
  });
});

router.get('/users', requireAdmin, (_req: Request, res: Response) => {
  const windowStart = getMonthWindowStart();
  const users = listUsers();
  const result = users.map((u: any) => {
    const spending = getUserSpending(u.id, windowStart);
    return {
      id: u.id,
      username: u.username,
      spent_usd: spending.spent_usd,
      limit_usd: spending.limit_usd,
      percent: spending.percent,
    };
  });
  res.json(result);
});

router.get('/workspaces', requireAdmin, (_req: Request, res: Response) => {
  let names: string[] = [];
  try {
    const root = getWorkspaceRoot();
    names = readdirSync(root).filter((name) => {
      try { return statSync(join(root, name)).isDirectory(); } catch { return false; }
    });
  } catch { /* workspace root may not exist yet */ }
  const windowStart = getMonthWindowStart();
  const result = names.map((name) => {
    const spending = getWorkspaceSpending(name, windowStart);
    return {
      workspace_name: name,
      spent_usd: spending.spent_usd,
      limit_usd: spending.limit_usd,
      percent: spending.percent,
    };
  });
  res.json(result);
});

router.get('/workspace/:name', requireAdmin, (req: Request, res: Response) => {
  const name = req.params.name as string;
  const windowStart = getMonthWindowStart();
  const spending = getWorkspaceSpending(name, windowStart);
  res.json({
    workspace_name: name,
    spent_usd: spending.spent_usd,
    limit_usd: spending.limit_usd,
    percent: spending.percent,
  });
});

export default router;
