import { Router, Request, Response } from 'express';
import { authMiddleware, requireAdmin } from '../security/auth.js';
import { getDb } from '../db/store.js';
import { v4 as uuidv4 } from 'uuid';
import { encrypt } from '../lib/crypto.js';

const router = Router();
router.use(authMiddleware);

const SECRET_NAME_RE = /^[a-zA-Z0-9_]{1,64}$/;

router.get('/', (_req: Request, res: Response) => {
  const db = getDb();
  const secrets = db.prepare('SELECT id, name, created_at FROM secrets').all();
  res.json(secrets);
});

router.post('/', requireAdmin, (req: Request, res: Response) => {
  const { name, value } = req.body;
  if (!name || !value) {
    res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Name and value required' } });
    return;
  }

  if (!SECRET_NAME_RE.test(name)) {
    res.status(400).json({
      error: { code: 'BAD_REQUEST', message: 'Secret name must be 1–64 alphanumeric/underscore characters' },
    });
    return;
  }

  const db = getDb();
  const id = uuidv4();
  const encrypted = encrypt(value);

  try {
    db.prepare('INSERT INTO secrets (id, name, encrypted_value) VALUES (?, ?, ?)').run(id, name, encrypted);
    res.status(201).json({ id, name });
  } catch (err: any) {
    if (err.code === 'SQLITE_CONSTRAINT_UNIQUE' || err.message?.includes('UNIQUE')) {
      res.status(409).json({ error: { code: 'CONFLICT', message: 'Secret name already exists' } });
    } else {
      throw err;
    }
  }
});

router.delete('/:id', requireAdmin, (req: Request, res: Response) => {
  const db = getDb();
  const result = db.prepare('DELETE FROM secrets WHERE id = ?').run(req.params.id);
  if (result.changes === 0) {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Secret not found' } });
    return;
  }
  res.json({ deleted: true });
});

export default router;
