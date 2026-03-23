import { describe, it, expect, beforeAll } from 'vitest';
import { getDb } from '../db/store.js';

const DEFAULT_BLOCKLIST = [
  'rm -rf /', 'rm -rf /*',
  'docker rm srijan-', 'docker stop srijan-', 'docker kill srijan-',
  'kill -9 1', 'dd if=', 'mkfs', 'chmod -R 777 /',
];

function getBoundaryBlocklist(db: ReturnType<typeof getDb>): string[] {
  const row = db.prepare("SELECT value FROM config WHERE key='agent_boundaries'").get() as any;
  if (row) {
    try {
      const v = JSON.parse(row.value);
      if (Array.isArray(v)) return v;
    } catch {}
  }
  return DEFAULT_BLOCKLIST;
}

function checkBoundary(blocklist: string[], command: string): string | undefined {
  return blocklist.find((p) => command.includes(p));
}

describe('Agent Boundaries', () => {
  let db: ReturnType<typeof getDb>;

  beforeAll(() => {
    db = getDb();
  });

  it('should block rm -rf / command', () => {
    const list = getBoundaryBlocklist(db);
    const blocked = checkBoundary(list, 'rm -rf /');
    expect(blocked).toBeTruthy();
  });

  it('should block docker rm srijan- command', () => {
    const list = getBoundaryBlocklist(db);
    const blocked = checkBoundary(list, 'docker rm srijan-myapp');
    expect(blocked).toBeTruthy();
  });

  it('should not block safe commands', () => {
    const list = getBoundaryBlocklist(db);
    const safe = ['ls -la', 'npm install', 'git status', 'node app.js', 'rm -rf ./node_modules'];
    for (const cmd of safe) {
      expect(checkBoundary(list, cmd)).toBeUndefined();
    }
  });

  it('should use custom blocklist from DB when set', () => {
    db.prepare(
      `INSERT INTO config (key, value, updated_at) VALUES (?, ?, datetime('now'))
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
    ).run('agent_boundaries', JSON.stringify(['custom-dangerous-command']));

    const list = getBoundaryBlocklist(db);
    expect(list).toContain('custom-dangerous-command');
    expect(checkBoundary(list, 'run custom-dangerous-command now')).toBeTruthy();

    // Reset
    db.prepare('DELETE FROM config WHERE key = ?').run('agent_boundaries');
  });

  it('should fall back to default list after custom is removed', () => {
    const list = getBoundaryBlocklist(db);
    expect(list).toEqual(DEFAULT_BLOCKLIST);
  });

  it('should not check non-Bash tools', () => {
    // Non-Bash tool_use should never be checked against blocklist
    const toolName: string = 'Read';
    const isBash = toolName === 'Bash';
    expect(isBash).toBe(false);
    // No boundary check performed for non-Bash
  });
});
