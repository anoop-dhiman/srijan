import { Router, Request, Response } from 'express';
import { authMiddleware, requireAdmin, createUser, deleteUser, changePassword, listUsers } from '../security/auth.js';

const router = Router();
router.use(authMiddleware);

const USERNAME_RE = /^[a-zA-Z0-9_-]{1,64}$/;
const MIN_PASSWORD_LENGTH = 8;

router.get('/', requireAdmin, (_req: Request, res: Response) => {
  res.json(listUsers());
});

router.post('/', requireAdmin, (req: Request, res: Response) => {
  const { username, password, role } = req.body;
  if (!username || !password || !role) {
    res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'username, password, and role are required' } });
    return;
  }
  if (!USERNAME_RE.test(username)) {
    res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'username must be 1–64 alphanumeric/hyphen/underscore characters' } });
    return;
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    res.status(400).json({ error: { code: 'BAD_REQUEST', message: `Password must be at least ${MIN_PASSWORD_LENGTH} characters` } });
    return;
  }
  if (!['admin', 'user'].includes(role)) {
    res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'role must be admin or user' } });
    return;
  }
  try {
    const result = createUser(username, password, role);
    res.status(201).json(result);
  } catch (err: any) {
    if (err.code === 'SQLITE_CONSTRAINT_UNIQUE' || err.message?.includes('UNIQUE')) {
      res.status(409).json({ error: { code: 'CONFLICT', message: 'Username already exists' } });
      return;
    }
    res.status(500).json({ error: { code: 'DB_ERROR', message: err.message } });
  }
});

router.delete('/:id', requireAdmin, (req: Request, res: Response) => {
  const { id } = req.params;
  const self = (req as any).user;
  if (id === self.userId) {
    res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Cannot delete your own account' } });
    return;
  }
  deleteUser(id);
  res.json({ deleted: true });
});

router.put('/:id/password', (req: Request, res: Response) => {
  const { id } = req.params;
  const { password } = req.body;
  const self = (req as any).user;

  if (!password) {
    res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'password is required' } });
    return;
  }

  if (password.length < MIN_PASSWORD_LENGTH) {
    res.status(400).json({ error: { code: 'BAD_REQUEST', message: `Password must be at least ${MIN_PASSWORD_LENGTH} characters` } });
    return;
  }

  // Only admin or the user themselves can change the password
  if (self.role !== 'admin' && self.userId !== id) {
    res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Access denied' } });
    return;
  }

  changePassword(id, password);
  res.json({ ok: true });
});

export default router;
