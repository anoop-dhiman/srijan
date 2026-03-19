import { afterAll } from 'vitest';
import { mkdirSync, rmSync } from 'fs';
import { closeDb } from '../db/store.js';

const testDir = '/tmp/srijan-test-' + Date.now() + '-' + Math.random().toString(36).slice(2);
mkdirSync(testDir, { recursive: true });

process.env.SRIJAN_DATA_DIR = testDir;
process.env.SRIJAN_ADMIN_PASSWORD = 'testpass';
process.env.SRIJAN_JWT_SECRET = 'test-secret';
process.env.SRIJAN_SECRETS_KEY = 'test-key-32-bytes-long-pad-here!';

afterAll(() => {
  closeDb();
  try { rmSync(testDir, { recursive: true }); } catch {}
});
