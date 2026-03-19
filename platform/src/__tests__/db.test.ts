import { describe, it, expect } from 'vitest';
import { getDb } from '../db/store.js';

describe('Database', () => {
  it('should initialize with WAL mode', () => {
    const db = getDb();
    const result = db.pragma('journal_mode') as any[];
    expect(result[0].journal_mode).toBe('wal');
  });

  it('should have all required tables', () => {
    const db = getDb();
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
      .all() as { name: string }[];
    const tableNames = tables.map((t) => t.name);

    expect(tableNames).toContain('users');
    expect(tableNames).toContain('sessions');
    expect(tableNames).toContain('events');
    expect(tableNames).toContain('secrets');
    expect(tableNames).toContain('apps');
    expect(tableNames).toContain('config');
  });

  it('should enforce foreign keys', () => {
    const db = getDb();
    const result = db.pragma('foreign_keys') as any[];
    expect(result[0].foreign_keys).toBe(1);
  });
});
