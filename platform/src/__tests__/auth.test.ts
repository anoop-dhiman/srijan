import { describe, it, expect, beforeAll } from 'vitest';
import { setupAdmin, login, verifyToken } from '../security/auth.js';
import { getDb } from '../db/store.js';

describe('Auth', () => {
  beforeAll(() => {
    getDb(); // Initialize DB
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
      const count = db.prepare('SELECT COUNT(*) as c FROM users').get() as any;
      expect(count.c).toBe(1);
    });
  });

  describe('login', () => {
    it('should return JWT token for valid credentials', () => {
      const token = login('admin', 'testpass');
      expect(token).toBeTruthy();
      expect(typeof token).toBe('string');
    });

    it('should return null for invalid password', () => {
      const token = login('admin', 'wrongpass');
      expect(token).toBeNull();
    });

    it('should return null for invalid username', () => {
      const token = login('nonexistent', 'testpass');
      expect(token).toBeNull();
    });
  });

  describe('verifyToken', () => {
    it('should verify valid token', () => {
      const token = login('admin', 'testpass')!;
      const payload = verifyToken(token);
      expect(payload).toBeDefined();
      expect(payload!.username).toBe('admin');
      expect(payload!.userId).toBeTruthy();
    });

    it('should return null for invalid token', () => {
      const payload = verifyToken('invalid.token.here');
      expect(payload).toBeNull();
    });

    it('should return null for tampered token', () => {
      const token = login('admin', 'testpass')!;
      const tampered = token.slice(0, -5) + 'xxxxx';
      const payload = verifyToken(tampered);
      expect(payload).toBeNull();
    });
  });
});
