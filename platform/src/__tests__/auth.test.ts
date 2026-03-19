import { describe, it, expect, beforeAll } from 'vitest';
import {
  setupAdmin, login, verifyToken, generateTotpSecret, verifyTotpCode,
  enableTotp, disableTotp, getTotpStatus, verifyTotpChallenge, createUser,
} from '../security/auth.js';
import { getDb } from '../db/store.js';

describe('Auth', () => {
  beforeAll(() => {
    getDb();
    setupAdmin('testpass');
  });

  describe('setupAdmin', () => {
    it('should create admin user', () => {
      const db = getDb();
      const user = db.prepare('SELECT * FROM users WHERE username = ?').get('admin') as any;
      expect(user).toBeDefined();
      expect(user.username).toBe('admin');
    });

    it('should not create duplicate admin', () => {
      setupAdmin('different-password');
      const db = getDb();
      const users = db.prepare('SELECT COUNT(*) as c FROM users WHERE username = ?').get('admin') as any;
      expect(users.c).toBe(1);
    });
  });

  describe('login', () => {
    it('should return JWT token for valid credentials', () => {
      const result = login('admin', 'testpass');
      expect(result).toBeTruthy();
      expect((result as any).token).toBeTruthy();
      expect(typeof (result as any).token).toBe('string');
    });

    it('should return null for invalid password', () => {
      const result = login('admin', 'wrongpass');
      expect(result).toBeNull();
    });

    it('should return null for invalid username', () => {
      const result = login('nonexistent', 'testpass');
      expect(result).toBeNull();
    });

    it('should include role in JWT payload', () => {
      const result = login('admin', 'testpass') as { token: string };
      const payload = verifyToken(result.token);
      expect(payload?.role).toBe('admin');
    });
  });

  describe('verifyToken', () => {
    it('should verify valid token', () => {
      const result = login('admin', 'testpass') as { token: string };
      const payload = verifyToken(result.token);
      expect(payload).toBeDefined();
      expect(payload!.username).toBe('admin');
      expect(payload!.userId).toBeTruthy();
    });

    it('should return null for invalid token', () => {
      const payload = verifyToken('invalid.token.here');
      expect(payload).toBeNull();
    });

    it('should return null for tampered token', () => {
      const result = login('admin', 'testpass') as { token: string };
      const tampered = result.token.slice(0, -5) + 'xxxxx';
      const payload = verifyToken(tampered);
      expect(payload).toBeNull();
    });
  });

  describe('TOTP', () => {
    let testUserId: string;
    const testUsername = 'totp-test-' + Date.now();

    beforeAll(() => {
      const result = createUser(testUsername, 'pass', 'user');
      testUserId = result.id;
    });

    it('generateTotpSecret returns secret and uri', () => {
      const { secret, uri } = generateTotpSecret(testUsername);
      expect(typeof secret).toBe('string');
      expect(secret.length).toBeGreaterThan(0);
      expect(uri).toContain('otpauth://totp/');
    });

    it('verifyTotpCode returns false for invalid code', () => {
      const { secret } = generateTotpSecret(testUsername);
      expect(verifyTotpCode(secret, '000000')).toBe(false);
    });

    it('verifyTotpCode returns true for current code', async () => {
      const OTPAuth = await import('otpauth');
      const { secret } = generateTotpSecret(testUsername);
      const totp = new OTPAuth.TOTP({
        algorithm: 'SHA1', digits: 6, period: 30,
        secret: OTPAuth.Secret.fromBase32(secret),
      });
      const code = totp.generate();
      expect(verifyTotpCode(secret, code)).toBe(true);
    });

    it('enableTotp rejects wrong code', () => {
      const { secret } = generateTotpSecret(testUsername);
      expect(enableTotp(testUserId, secret, '000000')).toBe(false);
      expect(getTotpStatus(testUserId)).toBe(false);
    });

    it('enableTotp accepts correct code', async () => {
      const OTPAuth = await import('otpauth');
      const { secret } = generateTotpSecret(testUsername);
      const totp = new OTPAuth.TOTP({
        algorithm: 'SHA1', digits: 6, period: 30,
        secret: OTPAuth.Secret.fromBase32(secret),
      });
      const code = totp.generate();
      expect(enableTotp(testUserId, secret, code)).toBe(true);
      expect(getTotpStatus(testUserId)).toBe(true);
    });

    it('login returns challenge token when TOTP enabled', async () => {
      const result = login(testUsername, 'pass');
      expect(result).toBeTruthy();
      expect((result as any).requires_totp).toBe(true);
      expect((result as any).challenge_token).toBeTruthy();
    });

    it('verifyTotpChallenge rejects wrong code', () => {
      const result = login(testUsername, 'pass') as { requires_totp: true; challenge_token: string };
      const token = verifyTotpChallenge(result.challenge_token, '000000');
      expect(token).toBeNull();
    });

    it('verifyTotpChallenge returns full JWT for correct code', async () => {
      const OTPAuth = await import('otpauth');
      const db = getDb();
      const user = db.prepare('SELECT totp_secret FROM users WHERE id = ?').get(testUserId) as any;
      const totp = new OTPAuth.TOTP({
        algorithm: 'SHA1', digits: 6, period: 30,
        secret: OTPAuth.Secret.fromBase32(user.totp_secret),
      });
      const code = totp.generate();
      const result = login(testUsername, 'pass') as { requires_totp: true; challenge_token: string };
      const token = verifyTotpChallenge(result.challenge_token, code);
      expect(token).toBeTruthy();
      const payload = verifyToken(token!);
      expect(payload?.username).toBe(testUsername);
    });

    it('challenge token is rejected by authMiddleware (verifyToken returns null)', async () => {
      const result = login(testUsername, 'pass') as { requires_totp: true; challenge_token: string };
      // Challenge tokens should not pass as full auth tokens
      const payload = verifyToken(result.challenge_token);
      expect(payload).toBeNull();
    });

    it('disableTotp rejects wrong code', async () => {
      expect(disableTotp(testUserId, '000000')).toBe(false);
      expect(getTotpStatus(testUserId)).toBe(true);
    });

    it('disableTotp accepts correct code', async () => {
      const OTPAuth = await import('otpauth');
      const db = getDb();
      const user = db.prepare('SELECT totp_secret FROM users WHERE id = ?').get(testUserId) as any;
      const totp = new OTPAuth.TOTP({
        algorithm: 'SHA1', digits: 6, period: 30,
        secret: OTPAuth.Secret.fromBase32(user.totp_secret),
      });
      const code = totp.generate();
      expect(disableTotp(testUserId, code)).toBe(true);
      expect(getTotpStatus(testUserId)).toBe(false);
    });
  });
});
