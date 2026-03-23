import simpleGit, { SimpleGit } from 'simple-git';
import { existsSync, mkdirSync } from 'fs';
import { promises as fs } from 'fs';
import { join } from 'path';
import { buildAuthUrl, stripAuthFromUrl, type GitCredentials } from '../lib/gitAuth.js';

const WORKSPACE_ROOT = process.env.WORKSPACE_ROOT || '/workspaces';
const SAFE_NAME_RE = /^[a-zA-Z0-9_-]+$/;

export function validateWorkspaceName(name: string): void {
  if (!SAFE_NAME_RE.test(name)) {
    throw new Error(`Invalid workspace name: "${name}". Only alphanumeric, hyphen, and underscore characters are allowed.`);
  }
}

/** Strip embedded credentials (user:pass@) from URLs in error messages. */
function sanitizeError(err: unknown): Error {
  const msg = err instanceof Error ? err.message : String(err);
  const sanitized = msg.replace(/[^/\s]*:[^@/\s]*@/g, '<redacted>@');
  return new Error(sanitized);
}

export function getWorkspaceRoot(): string {
  if (!existsSync(WORKSPACE_ROOT)) {
    mkdirSync(WORKSPACE_ROOT, { recursive: true });
  }
  return WORKSPACE_ROOT;
}

export function getGit(repoName: string): SimpleGit {
  validateWorkspaceName(repoName);
  const repoPath = join(getWorkspaceRoot(), repoName);
  if (!existsSync(repoPath)) {
    mkdirSync(repoPath, { recursive: true });
  }
  return simpleGit(repoPath).env({ GIT_TERMINAL_PROMPT: '0' });
}

export interface GitIdentity {
  name: string;
  email: string;
}

export async function setGitIdentity(repoName: string, identity: GitIdentity): Promise<void> {
  const git = getGit(repoName);
  if (identity.name) await git.addConfig('user.name', identity.name, false, 'local');
  if (identity.email) await git.addConfig('user.email', identity.email, false, 'local');
}

export async function getGitIdentity(repoName: string): Promise<GitIdentity> {
  const git = getGit(repoName);
  let name = '';
  let email = '';
  try { name = (await git.getConfig('user.name')).value || ''; } catch { /* not set */ }
  try { email = (await git.getConfig('user.email')).value || ''; } catch { /* not set */ }
  return { name, email };
}

export async function cloneRepo(url: string, name: string, creds?: GitCredentials, identity?: GitIdentity): Promise<string> {
  validateWorkspaceName(name);
  const targetPath = join(getWorkspaceRoot(), name);
  if (existsSync(join(targetPath, '.git'))) {
    await pullRepo(name, creds);
    return targetPath;
  }

  const cleanUrl = stripAuthFromUrl(url);
  const cloneUrl = creds ? buildAuthUrl(cleanUrl, creds.username, creds.token) : cleanUrl;
  try {
    await simpleGit().env({ GIT_TERMINAL_PROMPT: '0' }).clone(cloneUrl, targetPath);
  } catch (err) {
    throw sanitizeError(err);
  }

  // Always store the clean URL (no credentials) in .git/config
  if (creds) {
    const git = simpleGit(targetPath).env({ GIT_TERMINAL_PROMPT: '0' });
    await git.remote(['set-url', 'origin', cleanUrl]);
  }

  if (identity) await setGitIdentity(name, identity);

  return targetPath;
}

export async function initRepo(name: string, identity?: GitIdentity): Promise<string> {
  const targetPath = join(getWorkspaceRoot(), name);
  mkdirSync(targetPath, { recursive: true });
  const git = simpleGit(targetPath);
  await git.init();
  if (identity) await setGitIdentity(name, identity);
  return targetPath;
}

export async function setRemote(name: string, url: string): Promise<void> {
  const git = getGit(name);
  const remotes = await git.getRemotes();
  const cleanUrl = stripAuthFromUrl(url);
  if (remotes.some(r => r.name === 'origin')) {
    await git.remote(['set-url', 'origin', cleanUrl]);
  } else {
    await git.addRemote('origin', cleanUrl);
  }
}

export async function commitAll(name: string, message: string): Promise<void> {
  const git = getGit(name);
  const status = await git.status();
  if (status.files.length === 0) return;
  await git.add('-A');
  await git.commit(message);
}

export async function pushRepo(name: string, creds?: GitCredentials): Promise<void> {
  const git = getGit(name);
  const remotes = await git.getRemotes(true);
  const origin = remotes.find(r => r.name === 'origin');
  if (!origin) throw new Error('No remote "origin" configured');

  const cleanUrl = origin.refs.push || origin.refs.fetch;
  if (!cleanUrl) throw new Error('No push URL configured for origin');

  if (creds) {
    const authUrl = buildAuthUrl(cleanUrl, creds.username, creds.token);
    await git.remote(['set-url', 'origin', authUrl]);
    try {
      await git.push(['-u', 'origin', 'HEAD']);
    } catch (err) {
      throw sanitizeError(err);
    } finally {
      await git.remote(['set-url', 'origin', cleanUrl]);
    }
  } else {
    try {
      await git.push(['-u', 'origin', 'HEAD']);
    } catch (err) {
      throw sanitizeError(err);
    }
  }
}

export async function deleteWorkspace(name: string): Promise<void> {
  const wsPath = join(getWorkspaceRoot(), name);
  await fs.rm(wsPath, { recursive: true, force: true });
}

export async function pullRepo(name: string, creds?: GitCredentials): Promise<{ summary: object }> {
  const git = getGit(name);
  const remotes = await git.getRemotes(true);
  const origin = remotes.find(r => r.name === 'origin');
  const cleanUrl = origin?.refs.fetch || origin?.refs.push;

  if (creds && cleanUrl) {
    const authUrl = buildAuthUrl(cleanUrl, creds.username, creds.token);
    await git.remote(['set-url', 'origin', authUrl]);
    try {
      const result = await git.pull();
      return { summary: result.summary };
    } catch (err) {
      throw sanitizeError(err);
    } finally {
      await git.remote(['set-url', 'origin', cleanUrl]);
    }
  } else {
    try {
      const result = await git.pull();
      return { summary: result.summary };
    } catch (err) {
      throw sanitizeError(err);
    }
  }
}
