import simpleGit, { SimpleGit } from 'simple-git';
import { existsSync, mkdirSync } from 'fs';
import { join } from 'path';

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
  return simpleGit(repoPath);
}

export async function cloneRepo(url: string, name: string): Promise<string> {
  const targetPath = join(getWorkspaceRoot(), name);
  if (existsSync(join(targetPath, '.git'))) {
    const git = simpleGit(targetPath);
    await git.pull();
    return targetPath;
  }

  await simpleGit().clone(url, targetPath);
  return targetPath;
}

export async function initRepo(name: string): Promise<string> {
  const targetPath = join(getWorkspaceRoot(), name);
  mkdirSync(targetPath, { recursive: true });
  const git = simpleGit(targetPath);
  await git.init();
  return targetPath;
}
