import simpleGit, { SimpleGit } from 'simple-git';
import { existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { buildAuthUrl, stripAuthFromUrl, type GitCredentials } from '../lib/gitAuth.js';

const WORKSPACE_ROOT = process.env.WORKSPACE_ROOT || '/workspaces';

export function getWorkspaceRoot(): string {
  if (!existsSync(WORKSPACE_ROOT)) {
    mkdirSync(WORKSPACE_ROOT, { recursive: true });
  }
  return WORKSPACE_ROOT;
}

export function getGit(repoName: string): SimpleGit {
  const repoPath = join(getWorkspaceRoot(), repoName);
  if (!existsSync(repoPath)) {
    mkdirSync(repoPath, { recursive: true });
  }
  return simpleGit(repoPath).env({ GIT_TERMINAL_PROMPT: '0' });
}

export async function cloneRepo(url: string, name: string, creds?: GitCredentials): Promise<string> {
  const targetPath = join(getWorkspaceRoot(), name);
  if (existsSync(join(targetPath, '.git'))) {
    await pullRepo(name, creds);
    return targetPath;
  }

  const cleanUrl = stripAuthFromUrl(url);
  const cloneUrl = creds ? buildAuthUrl(cleanUrl, creds.username, creds.token) : cleanUrl;
  await simpleGit().env({ GIT_TERMINAL_PROMPT: '0' }).clone(cloneUrl, targetPath);

  // Always store the clean URL (no credentials) in .git/config
  if (creds) {
    const git = simpleGit(targetPath).env({ GIT_TERMINAL_PROMPT: '0' });
    await git.remote(['set-url', 'origin', cleanUrl]);
  }

  return targetPath;
}

export async function initRepo(name: string): Promise<string> {
  const targetPath = join(getWorkspaceRoot(), name);
  mkdirSync(targetPath, { recursive: true });
  const git = simpleGit(targetPath);
  await git.init();
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
    } finally {
      await git.remote(['set-url', 'origin', cleanUrl]);
    }
  } else {
    await git.push(['-u', 'origin', 'HEAD']);
  }
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
    } finally {
      await git.remote(['set-url', 'origin', cleanUrl]);
    }
  } else {
    const result = await git.pull();
    return { summary: result.summary };
  }
}
