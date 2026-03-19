import { Router, Request, Response } from 'express';
import { login, authMiddleware } from '../security/auth.js';

const router = Router();

router.post('/login', (req: Request, res: Response) => {
  const { username, password } = req.body;
  if (!username || !password) {
    res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Username and password required' } });
    return;
  }

  const token = login(username, password);
  if (!token) {
    res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Invalid credentials' } });
    return;
  }

  res.json({ token });
});

router.get('/me', authMiddleware, (req: Request, res: Response) => {
  res.json({ user: (req as any).user });
});

export default router;
