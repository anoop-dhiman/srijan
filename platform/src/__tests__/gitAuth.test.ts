import { describe, it, expect, beforeAll } from 'vitest';
import { getDb } from '../db/store.js';
import {
  detectProvider,
  buildAuthUrl,
  stripAuthFromUrl,
  getWorkspaceCredentials,
  saveWorkspaceCredentials,
  deleteWorkspaceCredentials,
} from '../lib/gitAuth.js';

describe('gitAuth', () => {
  beforeAll(() => {
    getDb();
  });

  describe('detectProvider', () => {
    it('detects github.com', () => {
      expect(detectProvider('https://github.com/user/repo.git')).toBe('github');
    });

    it('detects dev.azure.com', () => {
      expect(detectProvider('https://dev.azure.com/org/project/_git/repo')).toBe('azure');
    });

    it('detects visualstudio.com', () => {
      expect(detectProvider('https://org.visualstudio.com/project/_git/repo')).toBe('azure');
    });

    it('returns generic for unknown hosts', () => {
      expect(detectProvider('https://gitlab.com/user/repo.git')).toBe('generic');
    });

    it('returns generic for self-hosted URLs', () => {
      expect(detectProvider('https://git.mycompany.internal/repo.git')).toBe('generic');
    });

    it('is case-insensitive for github', () => {
      expect(detectProvider('https://GITHUB.COM/user/repo.git')).toBe('github');
    });

    it('is case-insensitive for azure', () => {
      expect(detectProvider('https://DEV.AZURE.COM/org/repo')).toBe('azure');
    });
  });

  describe('buildAuthUrl', () => {
    it('embeds username and token into URL', () => {
      const url = buildAuthUrl('https://github.com/user/repo.git', 'alice', 'mytoken');
      const parsed = new URL(url);
      expect(decodeURIComponent(parsed.username)).toBe('alice');
      expect(decodeURIComponent(parsed.password)).toBe('mytoken');
    });

    it('uses "git" as default when username is empty', () => {
      const url = buildAuthUrl('https://github.com/user/repo.git', '', 'mytoken');
      const parsed = new URL(url);
      expect(decodeURIComponent(parsed.username)).toBe('git');
    });

    it('preserves host, path, and protocol', () => {
      const url = buildAuthUrl('https://github.com/user/repo.git', 'alice', 'tok');
      expect(url).toContain('github.com');
      expect(url).toContain('/user/repo.git');
    });

    it('returns a valid URL', () => {
      const url = buildAuthUrl('https://github.com/user/repo.git', 'u', 'p');
      expect(() => new URL(url)).not.toThrow();
    });

    it('overwrites existing credentials in URL', () => {
      const url = buildAuthUrl('https://olduser:oldpass@github.com/repo.git', 'newuser', 'newpass');
      const parsed = new URL(url);
      expect(decodeURIComponent(parsed.username)).toBe('newuser');
      expect(decodeURIComponent(parsed.password)).toBe('newpass');
    });
  });

  describe('stripAuthFromUrl', () => {
    it('removes username and password from URL', () => {
      const stripped = stripAuthFromUrl('https://user:pass@github.com/user/repo.git');
      expect(stripped).not.toContain('user:pass@');
      expect(stripped).toContain('github.com/user/repo.git');
    });

    it('leaves a URL without credentials unchanged in structure', () => {
      const url = 'https://github.com/user/repo.git';
      const stripped = stripAuthFromUrl(url);
      expect(stripped).toContain('github.com');
      expect(stripped).toContain('/user/repo.git');
    });

    it('handles malformed URL gracefully by returning input', () => {
      const bad = 'not-a-valid-url';
      expect(stripAuthFromUrl(bad)).toBe(bad);
    });

    it('preserves path and protocol after stripping', () => {
      const stripped = stripAuthFromUrl('https://alice:token@dev.azure.com/org/proj/_git/repo');
      expect(stripped).toContain('dev.azure.com');
      expect(stripped).not.toContain('alice');
      expect(stripped).not.toContain('token');
    });
  });

  describe('saveWorkspaceCredentials / getWorkspaceCredentials / deleteWorkspaceCredentials', () => {
    const wsName = 'test-gitauth-ws-' + Date.now();

    it('returns null for unknown workspace', () => {
      expect(getWorkspaceCredentials('nonexistent-ws-xyz-' + Date.now())).toBeNull();
    });

    it('saves and retrieves credentials', () => {
      saveWorkspaceCredentials(wsName, 'github', 'alice', 'secret-token');
      const creds = getWorkspaceCredentials(wsName);
      expect(creds).not.toBeNull();
      expect(creds!.provider).toBe('github');
      expect(creds!.username).toBe('alice');
      expect(creds!.token).toBe('secret-token');
    });

    it('stores token encrypted (not plaintext) in DB', () => {
      const db = getDb();
      const row = db
        .prepare('SELECT encrypted_token FROM git_credentials WHERE workspace_name = ?')
        .get(wsName) as any;
      expect(row).toBeDefined();
      expect(row.encrypted_token).not.toBe('secret-token');
      expect(row.encrypted_token).toContain(':'); // AES-CBC format: iv:ciphertext
    });

    it('upserts: updates existing credentials for same workspace', () => {
      saveWorkspaceCredentials(wsName, 'azure', 'bob', 'new-token');
      const creds = getWorkspaceCredentials(wsName);
      expect(creds!.provider).toBe('azure');
      expect(creds!.username).toBe('bob');
      expect(creds!.token).toBe('new-token');

      // Only one row exists
      const db = getDb();
      const count = (
        db
          .prepare('SELECT COUNT(*) as c FROM git_credentials WHERE workspace_name = ?')
          .get(wsName) as any
      ).c;
      expect(count).toBe(1);
    });

    it('deletes credentials', () => {
      deleteWorkspaceCredentials(wsName);
      expect(getWorkspaceCredentials(wsName)).toBeNull();
    });

    it('deleteWorkspaceCredentials is a noop for unknown workspace', () => {
      expect(() => deleteWorkspaceCredentials('unknown-ws-' + Date.now())).not.toThrow();
    });

    it('saves credentials with empty username', () => {
      const ws2 = 'test-gitauth-nousername-' + Date.now();
      saveWorkspaceCredentials(ws2, 'generic', '', 'token-only');
      const creds = getWorkspaceCredentials(ws2);
      expect(creds!.username).toBe('');
      expect(creds!.token).toBe('token-only');
      deleteWorkspaceCredentials(ws2);
    });
  });
});
