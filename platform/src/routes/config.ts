import { Router, Request, Response } from 'express';
import { authMiddleware, requireAdmin } from '../security/auth.js';
import { getDb } from '../db/store.js';
import { DEFAULT_SYSTEM_PROMPT } from '../agent/runner.js';

const router = Router();

// Allowlist of config keys that can be written via the API
const WRITABLE_KEYS = new Set(['llm', 'system_prompt', 'agentMode', 'agent_boundaries', 'agentSdk', 'spending_alert_threshold']);

router.use(authMiddleware);

router.get('/', (_req: Request, res: Response) => {
  const db = getDb();
  const rows = db.prepare('SELECT key, value FROM config').all() as { key: string; value: string }[];
  const config: Record<string, any> = {};
  for (const row of rows) {
    config[row.key] = JSON.parse(row.value);
  }
  config.default_system_prompt = DEFAULT_SYSTEM_PROMPT;
  res.json(config);
});

router.put('/:key', requireAdmin, (req: Request, res: Response) => {
  const { key } = req.params;
  const { value } = req.body;
  if (value === undefined) {
    res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Value required' } });
    return;
  }

  if (!WRITABLE_KEYS.has(key)) {
    res.status(400).json({ error: { code: 'BAD_REQUEST', message: `Unknown config key: ${key}` } });
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
