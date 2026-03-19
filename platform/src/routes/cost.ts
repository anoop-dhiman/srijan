import { Router, Request, Response } from 'express';
import { authMiddleware } from '../security/auth.js';
import { getDb } from '../db/store.js';

const router = Router({ mergeParams: true });
router.use(authMiddleware);

router.get('/', (req: Request, res: Response) => {
  const { id } = req.params;
  const db = getDb();
  const row = db.prepare(`
    SELECT
      COALESCE(SUM(input_tokens), 0) as input_tokens,
      COALESCE(SUM(output_tokens), 0) as output_tokens,
      SUM(cost_usd) as cost_usd
    FROM token_usage
    WHERE session_id = ?
  `).get(id);
  res.json(row);
});

export default router;
