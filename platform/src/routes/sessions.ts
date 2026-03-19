import { Router, Request, Response } from 'express';
import { authMiddleware } from '../security/auth.js';
import { getSession, getSessionEvents } from '../agent/session.js';
import { getDb } from '../db/store.js';

const router = Router();
router.use(authMiddleware);

router.get('/:id/recording', (req: Request, res: Response) => {
  const { id } = req.params;
  const user = (req as any).user;

  const session = getSession(id);
  if (!session) {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Session not found' } });
    return;
  }

  if (session.userId !== user.userId) {
    res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Access denied' } });
    return;
  }

  const events = getSessionEvents(id);

  const db = getDb();
  const costRow = db
    .prepare('SELECT COALESCE(SUM(cost_usd), 0) as total FROM token_usage WHERE session_id = ?')
    .get(id) as { total: number };

  res.json({ session, events, totalCostUsd: costRow.total });
});

export default router;
