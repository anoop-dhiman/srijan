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
    expect(tableNames).toContain('token_usage');
    expect(tableNames).toContain('git_credentials');
  });

  it('sessions table has workspace_name column', () => {
    const db = getDb();
    const cols = db.prepare("PRAGMA table_info('sessions')").all() as { name: string }[];
    const colNames = cols.map(c => c.name);
    expect(colNames).toContain('workspace_name');
  });

  it('git_credentials table has required columns', () => {
    const db = getDb();
    const cols = db.prepare("PRAGMA table_info('git_credentials')").all() as { name: string }[];
    const colNames = cols.map(c => c.name);
    expect(colNames).toContain('id');
    expect(colNames).toContain('workspace_name');
    expect(colNames).toContain('provider');
    expect(colNames).toContain('username');
    expect(colNames).toContain('encrypted_token');
  });

  it('token_usage table has required columns', () => {
    const db = getDb();
    const cols = db.prepare("PRAGMA table_info('token_usage')").all() as { name: string }[];
    const colNames = cols.map(c => c.name);
    expect(colNames).toContain('session_id');
    expect(colNames).toContain('input_tokens');
    expect(colNames).toContain('output_tokens');
    expect(colNames).toContain('cost_usd');
    expect(colNames).toContain('model');
  });

  it('users table has role and totp columns', () => {
    const db = getDb();
    const cols = db.prepare("PRAGMA table_info('users')").all() as { name: string }[];
    const colNames = cols.map(c => c.name);
    expect(colNames).toContain('role');
    expect(colNames).toContain('totp_secret');
    expect(colNames).toContain('totp_enabled');
  });

  it('should enforce foreign keys', () => {
    const db = getDb();
    const result = db.pragma('foreign_keys') as any[];
    expect(result[0].foreign_keys).toBe(1);
  });
});
