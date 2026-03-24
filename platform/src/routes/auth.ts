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
import { getDb } from '../db/store.js';
import { encrypt } from '../lib/crypto.js';

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

// --- Claude OAuth routes ---

router.post('/claude-oauth/token', authMiddleware, (req: Request, res: Response) => {
  const { accessToken, refreshToken, expiresAt, accountEmail, subscriptionType } = req.body;
  if (!accessToken || typeof accessToken !== 'string') {
    res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'accessToken required' } });
    return;
  }
  const user = (req as any).user;
  const db = getDb();
  const encryptedAccessToken = encrypt(accessToken);
  const encryptedRefreshToken = refreshToken ? encrypt(refreshToken) : null;
  db.prepare(`
    INSERT INTO user_oauth_tokens (user_id, encrypted_access_token, encrypted_refresh_token, expires_at, account_email, subscription_type, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
    ON CONFLICT(user_id) DO UPDATE SET
      encrypted_access_token = excluded.encrypted_access_token,
      encrypted_refresh_token = excluded.encrypted_refresh_token,
      expires_at = excluded.expires_at,
      account_email = excluded.account_email,
      subscription_type = excluded.subscription_type,
      updated_at = datetime('now')
  `).run(
    user.userId,
    encryptedAccessToken,
    encryptedRefreshToken,
    expiresAt || null,
    accountEmail || null,
    subscriptionType || null,
  );
  res.json({ ok: true });
});

router.get('/claude-oauth/status', authMiddleware, (req: Request, res: Response) => {
  const user = (req as any).user;
  const db = getDb();
  const row = db.prepare('SELECT account_email, subscription_type, expires_at FROM user_oauth_tokens WHERE user_id = ?').get(user.userId) as any;
  if (!row) {
    res.json({ connected: false });
    return;
  }
  const now = Date.now();
  const connected = !row.expires_at || row.expires_at > now;
  res.json({
    connected,
    email: row.account_email || undefined,
    subscriptionType: row.subscription_type || undefined,
    expiresAt: row.expires_at || undefined,
  });
});

router.delete('/claude-oauth', authMiddleware, (req: Request, res: Response) => {
  const user = (req as any).user;
  const db = getDb();
  db.prepare('DELETE FROM user_oauth_tokens WHERE user_id = ?').run(user.userId);
  res.json({ ok: true });
});

export default router;
