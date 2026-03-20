import { Router, Request, Response } from 'express';
import {
  login,
  authMiddleware,
  generateTotpSecret,
  enableTotp,
  disableTotp,
  getTotpStatus,
  verifyTotpChallenge,
} from '../security/auth.js';

const router = Router();

router.post('/login', (req: Request, res: Response) => {
  const { username, password } = req.body;
  if (!username || !password) {
    res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Username and password required' } });
    return;
  }

  const result = login(username, password);
  if (result === 'rate_limited') {
    res.status(429).json({ error: { code: 'RATE_LIMITED', message: 'Too many login attempts. Try again later.' } });
    return;
  }
  if (!result) {
    res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Invalid credentials' } });
    return;
  }

  if ('requires_totp' in result) {
    res.json({ requires_totp: true, challenge_token: result.challenge_token });
    return;
  }

  res.json({ token: result.token });
});

router.get('/me', authMiddleware, (req: Request, res: Response) => {
  res.json({ user: (req as any).user });
});

// --- TOTP routes ---

router.post('/totp/verify', (req: Request, res: Response) => {
  const { challenge_token, code } = req.body;
  if (!challenge_token || !code) {
    res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'challenge_token and code required' } });
    return;
  }

  const token = verifyTotpChallenge(challenge_token, code);
  if (!token) {
    res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Invalid TOTP code' } });
    return;
  }

  res.json({ token });
});

router.post('/totp/setup', authMiddleware, (req: Request, res: Response) => {
  const user = (req as any).user;
  const { secret, uri } = generateTotpSecret(user.username);
  res.json({ secret, uri });
});

router.post('/totp/enable', authMiddleware, (req: Request, res: Response) => {
  const { secret, code } = req.body;
  if (!secret || !code) {
    res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'secret and code required' } });
    return;
  }

  const user = (req as any).user;
  const ok = enableTotp(user.userId, secret, code);
  if (!ok) {
    res.status(400).json({ error: { code: 'INVALID_CODE', message: 'Invalid TOTP code' } });
    return;
  }

  res.json({ ok: true });
});

router.post('/totp/disable', authMiddleware, (req: Request, res: Response) => {
  const { code } = req.body;
  if (!code) {
    res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'code required' } });
    return;
  }

  const user = (req as any).user;
  const ok = disableTotp(user.userId, code);
  if (!ok) {
    res.status(400).json({ error: { code: 'INVALID_CODE', message: 'Invalid TOTP code' } });
    return;
  }

  res.json({ ok: true });
});

router.get('/totp/status', authMiddleware, (req: Request, res: Response) => {
  const user = (req as any).user;
  const enabled = getTotpStatus(user.userId);
  res.json({ enabled });
});

export default router;
