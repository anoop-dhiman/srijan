import { Router, Request, Response } from 'express';
import { authMiddleware, requireAdmin, createUser, deleteUser, changePassword, listUsers } from '../security/auth.js';

const router = Router();
router.use(authMiddleware);

router.get('/', requireAdmin, (_req: Request, res: Response) => {
  res.json(listUsers());
});

router.post('/', requireAdmin, (req: Request, res: Response) => {
  const { username, password, role } = req.body;
  if (!username || !password || !role) {
    res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'username, password, and role are required' } });
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
    if (err.message?.includes('UNIQUE')) {
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

  // Only admin or the user themselves can change the password
  if (self.role !== 'admin' && self.userId !== id) {
    res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Access denied' } });
    return;
  }

  changePassword(id, password);
  res.json({ ok: true });
});

export default router;
