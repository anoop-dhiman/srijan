import { Request, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import { getDb } from '../db/store.js';
import * as OTPAuth from 'otpauth';
import { createLogger } from '../lib/logger.js';

const log = createLogger('auth');

const DEFAULT_JWT_SECRET = 'srijan-dev-secret-change-me';
const JWT_SECRET = process.env.SRIJAN_JWT_SECRET || DEFAULT_JWT_SECRET;
const JWT_EXPIRY = '24h';
const CHALLENGE_EXPIRY = '15m';

// In-memory login rate limiting: track failed attempts per username
const loginAttempts = new Map<string, { count: number; resetAt: number }>();
const MAX_ATTEMPTS = 10;
const WINDOW_MS = 15 * 60 * 1000; // 15 minutes

function checkRateLimit(username: string): boolean {
  const now = Date.now();
  const entry = loginAttempts.get(username);
  if (!entry || now > entry.resetAt) {
    loginAttempts.set(username, { count: 1, resetAt: now + WINDOW_MS });
    return true;
  }
  if (entry.count >= MAX_ATTEMPTS) return false;
  entry.count++;
  return true;
}

function clearRateLimit(username: string): void {
  loginAttempts.delete(username);
}

/** Call at startup — logs a critical warning if the default JWT secret is in use. */
export function checkSecretSecurity(): void {
  if (JWT_SECRET === DEFAULT_JWT_SECRET) {
    log.warn(
      'SRIJAN_JWT_SECRET is not set or uses the default value. ' +
      'This is insecure. Set a strong secret in production.'
    );
  }
}

export interface JwtPayload {
  userId: string;
  username: string;
  role: string;
}

interface ChallengePayload {
  userId: string;
  purpose: 'totp';
}

/** Returns true if the admin user was created, false if it already existed. */
export function setupAdmin(password: string): boolean {
  const db = getDb();
  const existing = db.prepare('SELECT id FROM users WHERE username = ?').get('admin');
  if (existing) return false;

  const hash = bcrypt.hashSync(password, 12);
  db.prepare('INSERT INTO users (id, username, password_hash, role) VALUES (?, ?, ?, ?)').run(
    uuidv4(),
    'admin',
    hash,
    'admin'
  );
  return true;
}

export type LoginResult =
  | { token: string }
  | { requires_totp: true; challenge_token: string }
  | null;

export function login(username: string, password: string): LoginResult | 'rate_limited' {
  if (!checkRateLimit(username)) return 'rate_limited';

  const db = getDb();
  const user = db
    .prepare('SELECT id, username, password_hash, role, totp_enabled, totp_secret FROM users WHERE username = ?')
    .get(username) as {
      id: string;
      username: string;
      password_hash: string;
      role: string;
      totp_enabled: number;
      totp_secret: string | null;
    } | undefined;

  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return null;
  }
  clearRateLimit(username);

  if (user.totp_enabled && user.totp_secret) {
    const challengeToken = jwt.sign(
      { userId: user.id, purpose: 'totp' } satisfies ChallengePayload,
      JWT_SECRET,
      { expiresIn: CHALLENGE_EXPIRY }
    );
    return { requires_totp: true, challenge_token: challengeToken };
  }

  const token = jwt.sign(
    { userId: user.id, username: user.username, role: user.role } satisfies JwtPayload,
    JWT_SECRET,
    { expiresIn: JWT_EXPIRY }
  );
  return { token };
}

export function verifyToken(token: string): JwtPayload | null {
  try {
    const payload = jwt.verify(token, JWT_SECRET) as any;
    // Reject challenge tokens (they have a 'purpose' claim)
    if (payload.purpose) return null;
    return payload as JwtPayload;
  } catch {
    return null;
  }
}

export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Missing token' } });
    return;
  }

  const payload = verifyToken(authHeader.slice(7));
  if (!payload) {
    res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Invalid token' } });
    return;
  }

  (req as any).user = payload;
  next();
}

export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  const user = (req as any).user as JwtPayload;
  if (user?.role !== 'admin') {
    res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Admin access required' } });
    return;
  }
  next();
}

// --- TOTP functions ---

export function generateTotpSecret(username: string): { secret: string; uri: string } {
  const totp = new OTPAuth.TOTP({
    issuer: 'Srijan',
    label: username,
    algorithm: 'SHA1',
    digits: 6,
    period: 30,
    secret: new OTPAuth.Secret(),
  });
  return { secret: totp.secret.base32, uri: totp.toString() };
}

export function verifyTotpCode(secret: string, code: string): boolean {
  // Validate: must be exactly 6 digits
  if (!/^\d{6}$/.test(code)) return false;
  try {
    const totp = new OTPAuth.TOTP({
      algorithm: 'SHA1',
      digits: 6,
      period: 30,
      secret: OTPAuth.Secret.fromBase32(secret),
    });
    const delta = totp.validate({ token: code, window: 1 });
    return delta !== null;
  } catch {
    return false;
  }
}

export function enableTotp(userId: string, secret: string, code: string): boolean {
  if (!verifyTotpCode(secret, code)) return false;
  const db = getDb();
  db.prepare('UPDATE users SET totp_secret = ?, totp_enabled = 1 WHERE id = ?').run(secret, userId);
  return true;
}

export function disableTotp(userId: string, code: string): boolean {
  const db = getDb();
  const user = db
    .prepare('SELECT totp_secret FROM users WHERE id = ?')
    .get(userId) as { totp_secret: string | null } | undefined;
  if (!user?.totp_secret) return false;
  if (!verifyTotpCode(user.totp_secret, code)) return false;
  db.prepare('UPDATE users SET totp_secret = NULL, totp_enabled = 0 WHERE id = ?').run(userId);
  return true;
}

export function getTotpStatus(userId: string): boolean {
  const db = getDb();
  const user = db
    .prepare('SELECT totp_enabled FROM users WHERE id = ?')
    .get(userId) as { totp_enabled: number } | undefined;
  return !!(user?.totp_enabled);
}

export function verifyTotpChallenge(challengeToken: string, code: string): string | null {
  try {
    const payload = jwt.verify(challengeToken, JWT_SECRET) as any;
    if (payload.purpose !== 'totp') return null;

    const db = getDb();
    const user = db
      .prepare('SELECT id, username, role, totp_secret FROM users WHERE id = ?')
      .get(payload.userId) as { id: string; username: string; role: string; totp_secret: string | null } | undefined;

    if (!user?.totp_secret) return null;
    if (!verifyTotpCode(user.totp_secret, code)) return null;

    return jwt.sign(
      { userId: user.id, username: user.username, role: user.role } satisfies JwtPayload,
      JWT_SECRET,
      { expiresIn: JWT_EXPIRY }
    );
  } catch {
    return null;
  }
}

// --- User management ---

export function createUser(username: string, password: string, role: string): { id: string } {
  const db = getDb();
  const id = uuidv4();
  const hash = bcrypt.hashSync(password, 12);
  db.prepare('INSERT INTO users (id, username, password_hash, role) VALUES (?, ?, ?, ?)').run(
    id, username, hash, role
  );
  return { id };
}

export function deleteUser(id: string): void {
  const db = getDb();
  db.prepare('DELETE FROM users WHERE id = ?').run(id);
}

export function changePassword(userId: string, newPassword: string): void {
  const db = getDb();
  const hash = bcrypt.hashSync(newPassword, 12);
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hash, userId);
}

export function listUsers(): { id: string; username: string; role: string; createdAt: string }[] {
  const db = getDb();
  return db
    .prepare('SELECT id, username, role, created_at as createdAt FROM users ORDER BY created_at ASC')
    .all() as any[];
}
