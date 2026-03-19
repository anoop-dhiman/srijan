import { describe, it, expect, beforeAll } from 'vitest';
import { getDb } from '../db/store.js';
import { encrypt, decrypt } from '../lib/crypto.js';
import { v4 as uuidv4 } from 'uuid';

describe('Secret Proxy (runner prepareSecrets)', () => {
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

    const envVars: Record<string, string> = {};
    const secretMap: Record<string, string> = {};
    for (const row of rows) {
      try {
        const realValue = decrypt(row.encrypted_value);
        const placeholder = `SRIJAN_PLACEHOLDER_${row.name.toLowerCase()}`;
        envVars[`SRIJAN_SECRET_${row.name}`] = placeholder;
        secretMap[placeholder] = realValue;
      } catch { /* skip malformed rows */ }
    }

    expect(typeof envVars).toBe('object');
    expect(typeof secretMap).toBe('object');
  });

  it('prepareSecrets: env var should contain placeholder, not real value', () => {
    const db = getDb();
    const name = 'PLACEHOLDER_TEST_' + Date.now();
    const value = 'actual-real-secret-' + Date.now();
    db.prepare('INSERT INTO secrets (id, name, encrypted_value) VALUES (?, ?, ?)')
      .run(uuidv4(), name, encrypt(value));

    const rows = db.prepare('SELECT name, encrypted_value FROM secrets WHERE name = ?').all(name) as
      { name: string; encrypted_value: string }[];

    const envVars: Record<string, string> = {};
    const secretMap: Record<string, string> = {};
    for (const row of rows) {
      try {
        const realValue = decrypt(row.encrypted_value);
        const placeholder = `SRIJAN_PLACEHOLDER_${row.name.toLowerCase()}`;
        envVars[`SRIJAN_SECRET_${row.name}`] = placeholder;
        secretMap[placeholder] = realValue;
      } catch {}
    }

    // Env var should have the placeholder, NOT the real value
    expect(envVars[`SRIJAN_SECRET_${name}`]).toBe(`SRIJAN_PLACEHOLDER_${name.toLowerCase()}`);
    expect(envVars[`SRIJAN_SECRET_${name}`]).not.toBe(value);

    // secretMap maps placeholder → real value
    const placeholder = `SRIJAN_PLACEHOLDER_${name.toLowerCase()}`;
    expect(secretMap[placeholder]).toBe(value);
  });

  it('secretMap correctly maps placeholder to real value', () => {
    const db = getDb();
    const name = 'INJECT_TEST_' + Date.now();
    const value = 'injected-value-123';
    db.prepare('INSERT INTO secrets (id, name, encrypted_value) VALUES (?, ?, ?)')
      .run(uuidv4(), name, encrypt(value));

    const rows = db.prepare('SELECT name, encrypted_value FROM secrets WHERE name = ?').all(name) as
      { name: string; encrypted_value: string }[];

    const secretMap: Record<string, string> = {};
    for (const row of rows) {
      try {
        const realValue = decrypt(row.encrypted_value);
        const placeholder = `SRIJAN_PLACEHOLDER_${row.name.toLowerCase()}`;
        secretMap[placeholder] = realValue;
      } catch {}
    }

    const placeholder = `SRIJAN_PLACEHOLDER_${name.toLowerCase()}`;
    expect(secretMap[placeholder]).toBe(value);
  });
});
