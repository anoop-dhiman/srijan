import { Router, Request, Response } from 'express';
import { authMiddleware } from '../security/auth.js';
import { getDb } from '../db/store.js';

const router = Router();

router.use(authMiddleware);

router.get('/', (_req: Request, res: Response) => {
  const db = getDb();
  const rows = db.prepare('SELECT key, value FROM config').all() as { key: string; value: string }[];
  const config: Record<string, any> = {};
  for (const row of rows) {
    config[row.key] = JSON.parse(row.value);
  }
  res.json(config);
});

router.put('/:key', (req: Request, res: Response) => {
  const { key } = req.params;
  const { value } = req.body;
  if (value === undefined) {
    res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Value required' } });
    return;
  }

  const db = getDb();
  db.prepare(
    `INSERT INTO config (key, value, updated_at) VALUES (?, ?, datetime('now'))
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
  ).run(key, JSON.stringify(value));

  res.json({ key, value });
});

export default router;
