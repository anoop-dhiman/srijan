import { Router, Request, Response } from 'express';
import { authMiddleware } from '../security/auth.js';
import { getDb } from '../db/store.js';
import { getVapidKeys } from '../lib/webPush.js';

const router = Router();
router.use(authMiddleware);

// GET /api/push/vapid-public-key
router.get('/vapid-public-key', (_req: Request, res: Response) => {
  const { publicKey } = getVapidKeys();
  res.json({ publicKey });
});

// POST /api/push/subscribe
router.post('/subscribe', (req: Request, res: Response) => {
  const { endpoint, keys } = req.body;
  if (!endpoint || !keys || !keys.p256dh || !keys.auth) {
    res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'endpoint and keys (p256dh, auth) are required' } });
    return;
  }

  const userId = (req as any).user?.userId;
  if (!userId) {
    res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } });
    return;
  }

  try {
    const db = getDb();
    db.prepare(
      `INSERT OR REPLACE INTO push_subscriptions (id, user_id, endpoint, keys_json)
       VALUES (lower(hex(randomblob(16))), ?, ?, ?)
       ON CONFLICT(endpoint) DO UPDATE SET user_id = excluded.user_id, keys_json = excluded.keys_json`,
    ).run(userId, endpoint, JSON.stringify(keys));
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: { code: 'DB_ERROR', message: err.message } });
  }
});

// DELETE /api/push/subscribe
router.delete('/subscribe', (req: Request, res: Response) => {
  const { endpoint } = req.body;
  if (!endpoint) {
    res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'endpoint is required' } });
    return;
  }

  try {
    const db = getDb();
    db.prepare(`DELETE FROM push_subscriptions WHERE endpoint = ?`).run(endpoint);
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: { code: 'DB_ERROR', message: err.message } });
  }
});

export default router;
