import { describe, it, expect, beforeAll } from 'vitest';
import { getDb } from '../db/store.js';
import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';

const ENCRYPTION_KEY = process.env.SRIJAN_SECRETS_KEY || 'test-key-32-bytes-long-pad-here!';

function encrypt(text: string): string {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY.padEnd(32).slice(0, 32)), iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return iv.toString('hex') + ':' + encrypted;
}

function decrypt(text: string): string {
  const [ivHex, encrypted] = text.split(':');
  const iv = Buffer.from(ivHex, 'hex');
  const decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY.padEnd(32).slice(0, 32)), iv);
  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

describe('Secrets', () => {
  beforeAll(() => {
    getDb();
  });

  it('should encrypt and decrypt correctly', () => {
    const original = 'sk-ant-api03-super-secret-key';
    const encrypted = encrypt(original);
    expect(encrypted).not.toBe(original);
    expect(encrypted).toContain(':');

    const decrypted = decrypt(encrypted);
    expect(decrypted).toBe(original);
  });

  it('should produce different ciphertext for same input (random IV)', () => {
    const value = 'my-secret-value';
    const enc1 = encrypt(value);
    const enc2 = encrypt(value);
    expect(enc1).not.toBe(enc2);
    expect(decrypt(enc1)).toBe(value);
    expect(decrypt(enc2)).toBe(value);
  });

  it('should store and retrieve secrets from DB', () => {
    const db = getDb();
    const id = uuidv4();
    const name = 'TEST_API_KEY';
    const value = 'sk-test-12345';
    const encrypted = encrypt(value);

    db.prepare('INSERT INTO secrets (id, name, encrypted_value) VALUES (?, ?, ?)').run(id, name, encrypted);

    const row = db.prepare('SELECT * FROM secrets WHERE id = ?').get(id) as any;
    expect(row.name).toBe(name);
    expect(row.encrypted_value).not.toBe(value);
    expect(decrypt(row.encrypted_value)).toBe(value);
  });

  it('should enforce unique secret names', () => {
    const db = getDb();
    const name = 'UNIQUE_SECRET_' + Date.now();
    db.prepare('INSERT INTO secrets (id, name, encrypted_value) VALUES (?, ?, ?)').run(uuidv4(), name, 'enc1');

    expect(() => {
      db.prepare('INSERT INTO secrets (id, name, encrypted_value) VALUES (?, ?, ?)').run(uuidv4(), name, 'enc2');
    }).toThrow();
  });
});
