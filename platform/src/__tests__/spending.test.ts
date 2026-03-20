import { describe, it, expect, beforeAll } from 'vitest';
import { getDb } from '../db/store.js';
import { setupAdmin } from '../security/auth.js';
import { getMonthWindowStart, getUserSpending, getWorkspaceSpending, checkSpendingLimits } from '../lib/spending.js';

describe('Spending library', () => {
  let userId: string;

  beforeAll(() => {
    getDb();
    setupAdmin('testpass1');
    // Get admin user id
    const row = getDb().prepare("SELECT id FROM users WHERE username = 'admin'").get() as { id: string } | undefined;
    userId = row!.id;
    // Ensure spending columns exist (migrations run in getDb)
  });

  describe('getMonthWindowStart', () => {
    it('returns an ISO string', () => {
      const result = getMonthWindowStart();
      expect(typeof result).toBe('string');
      expect(() => new Date(result)).not.toThrow();
    });

    it('is the first day of the current month at UTC midnight', () => {
      const result = getMonthWindowStart();
      const d = new Date(result);
      expect(d.getUTCDate()).toBe(1);
      expect(d.getUTCHours()).toBe(0);
      expect(d.getUTCMinutes()).toBe(0);
    });
  });

  describe('getUserSpending', () => {
    it('returns zero spent when no usage', () => {
      const windowStart = getMonthWindowStart();
      const result = getUserSpending(userId, windowStart);
      expect(result.spent_usd).toBeGreaterThanOrEqual(0);
      expect(result.limit_usd).toBeNull(); // no limit set initially
      expect(result.percent).toBeNull();
    });

    it('returns null percent when limit is null', () => {
      const windowStart = getMonthWindowStart();
      const result = getUserSpending(userId, windowStart);
      expect(result.percent).toBeNull();
    });

    it('calculates percent when limit is set', () => {
      const db = getDb();
      db.prepare('UPDATE users SET spending_limit_usd = ? WHERE id = ?').run(10, userId);
      const windowStart = getMonthWindowStart();
      const result = getUserSpending(userId, windowStart);
      expect(result.limit_usd).toBe(10);
      expect(result.percent).toBeGreaterThanOrEqual(0);
      // Reset
      db.prepare('UPDATE users SET spending_limit_usd = NULL WHERE id = ?').run(userId);
    });
  });

  describe('getWorkspaceSpending', () => {
    it('returns zero spent for unknown workspace', () => {
      const windowStart = getMonthWindowStart();
      const result = getWorkspaceSpending('nonexistent-ws', windowStart);
      expect(result.spent_usd).toBe(0);
      expect(result.limit_usd).toBeNull();
      expect(result.percent).toBeNull();
    });

    it('returns limit when workspace_spending row exists', () => {
      const db = getDb();
      db.prepare(
        `INSERT INTO workspace_spending (workspace_name, spending_limit_usd)
         VALUES (?, ?)
         ON CONFLICT(workspace_name) DO UPDATE SET spending_limit_usd = excluded.spending_limit_usd`
      ).run('test-ws', 5);
      const windowStart = getMonthWindowStart();
      const result = getWorkspaceSpending('test-ws', windowStart);
      expect(result.limit_usd).toBe(5);
      expect(result.percent).toBeGreaterThanOrEqual(0);
      // Cleanup
      db.prepare('DELETE FROM workspace_spending WHERE workspace_name = ?').run('test-ws');
    });
  });

  describe('checkSpendingLimits', () => {
    it('allows when no limits are set', () => {
      const result = checkSpendingLimits(userId, 'some-workspace');
      expect(result.allowed).toBe(true);
      expect(result.reason).toBeUndefined();
    });

    it('blocks when user limit is exceeded', () => {
      const db = getDb();
      // Set limit to 0 so any spend exceeds it (or if spent_usd >= limit_usd)
      db.prepare('UPDATE users SET spending_limit_usd = ? WHERE id = ?').run(0, userId);
      const result = checkSpendingLimits(userId, 'some-workspace');
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('spending limit');
      // Reset
      db.prepare('UPDATE users SET spending_limit_usd = NULL WHERE id = ?').run(userId);
    });

    it('blocks when workspace limit is exceeded', () => {
      const db = getDb();
      db.prepare(
        `INSERT INTO workspace_spending (workspace_name, spending_limit_usd)
         VALUES (?, ?)
         ON CONFLICT(workspace_name) DO UPDATE SET spending_limit_usd = excluded.spending_limit_usd`
      ).run('limited-ws', 0);
      const result = checkSpendingLimits(userId, 'limited-ws');
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('spending limit');
      // Cleanup
      db.prepare('DELETE FROM workspace_spending WHERE workspace_name = ?').run('limited-ws');
    });

    it('allows when limit is set but not exceeded', () => {
      const db = getDb();
      db.prepare('UPDATE users SET spending_limit_usd = ? WHERE id = ?').run(1000, userId);
      const result = checkSpendingLimits(userId, 'any-workspace');
      expect(result.allowed).toBe(true);
      // Reset
      db.prepare('UPDATE users SET spending_limit_usd = NULL WHERE id = ?').run(userId);
    });
  });
});
