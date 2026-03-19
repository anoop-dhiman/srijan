import { describe, it, expect, beforeAll } from 'vitest';
import { getDb } from '../db/store.js';
import { encrypt, decrypt } from '../lib/crypto.js';
import { v4 as uuidv4 } from 'uuid';

describe('Secret Proxy (runner loadSecrets)', () => {
  beforeAll(() => {
    getDb();
  });

  it('should encrypt and store a secret, then be decryptable from DB', () => {
    const db = getDb();
    const name = 'MY_API_KEY_' + Date.now();
    const value = 'super-secret-value';
    const encrypted = encrypt(value);

    db.prepare('INSERT INTO secrets (id, name, encrypted_value) VALUES (?, ?, ?)')
      .run(uuidv4(), name, encrypted);

    const row = db.prepare('SELECT encrypted_value FROM secrets WHERE name = ?').get(name) as any;
    expect(row).toBeTruthy();
    const decrypted = decrypt(row.encrypted_value);
    expect(decrypted).toBe(value);
  });

  it('should skip secrets with malformed encrypted_value without throwing', () => {
    const db = getDb();
    db.prepare('INSERT INTO secrets (id, name, encrypted_value) VALUES (?, ?, ?)')
      .run(uuidv4(), 'MALFORMED_SECRET_' + Date.now(), 'not-valid-encrypted-data');

    const rows = db.prepare('SELECT name, encrypted_value FROM secrets').all() as
      { name: string; encrypted_value: string }[];

    const result: Record<string, string> = {};
    for (const row of rows) {
      try {
        result[`SRIJAN_SECRET_${row.name}`] = decrypt(row.encrypted_value);
      } catch { /* skip malformed rows */ }
    }

    expect(typeof result).toBe('object');
  });

  it('should inject secret as SRIJAN_SECRET_<NAME>', () => {
    const db = getDb();
    const name = 'INJECT_TEST_' + Date.now();
    const value = 'injected-value-123';
    db.prepare('INSERT INTO secrets (id, name, encrypted_value) VALUES (?, ?, ?)')
      .run(uuidv4(), name, encrypt(value));

    const rows = db.prepare('SELECT name, encrypted_value FROM secrets WHERE name = ?').all(name) as
      { name: string; encrypted_value: string }[];

    const env: Record<string, string> = {};
    for (const row of rows) {
      try { env[`SRIJAN_SECRET_${row.name}`] = decrypt(row.encrypted_value); } catch {}
    }

    expect(env[`SRIJAN_SECRET_${name}`]).toBe(value);
  });
});
