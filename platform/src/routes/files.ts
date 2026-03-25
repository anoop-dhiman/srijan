import { Router, Request, Response } from 'express';
import { authMiddleware } from '../security/auth.js';
import { getWorkspaceRoot } from '../git/manager.js';
import { readdirSync, statSync, lstatSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join, resolve, sep, dirname } from 'path';
import { execSync } from 'child_process';

const router = Router();
router.use(authMiddleware);

const MAX_FILE_SIZE = 1024 * 1024; // 1 MB
const MAX_PATH_LENGTH = 4096;

const HIDDEN_ENTRIES = new Set(['.git', '.svn', '.hg']);

function isBinary(buffer: Buffer): boolean {
  for (let i = 0; i < Math.min(buffer.length, 1024); i++) {
    if (buffer[i] === 0) return true;
  }
  return false;
}

function isUnderBase(resolvedPath: string, base: string): boolean {
  return resolvedPath === base || resolvedPath.startsWith(base + sep);
}

router.get('/:name/files', (req: Request, res: Response) => {
  const name = req.params.name as string;
  const requestedPath = (req.query.path as string) || '';

  if (requestedPath.length > MAX_PATH_LENGTH) {
    res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Path too long' } });
    return;
  }

  const workspaceBase = resolve(join(getWorkspaceRoot(), name));
  const resolvedPath = resolve(workspaceBase, requestedPath);

  if (!isUnderBase(resolvedPath, workspaceBase)) {
    res.status(400).json({ error: { code: 'PATH_TRAVERSAL', message: 'Path traversal not allowed' } });
    return;
  }

  try {
    const lstat = lstatSync(resolvedPath);
    if (lstat.isSymbolicLink()) {
      res.status(403).json({ error: { code: 'SYMLINK', message: 'Symbolic links are not allowed' } });
      return;
    }
    const stat = statSync(resolvedPath);
    if (!stat.isDirectory()) {
      res.status(400).json({ error: { code: 'NOT_DIRECTORY', message: 'Path is not a directory' } });
      return;
    }

    const names = readdirSync(resolvedPath).filter((n) => !HIDDEN_ENTRIES.has(n));
    const entries = names
      .map((n) => {
        try {
          const entryPath = join(resolvedPath, n);
          const ls = lstatSync(entryPath);
          if (ls.isSymbolicLink()) return null; // skip symlinks
          const s = statSync(entryPath);
          return {
            name: n,
            type: s.isDirectory() ? 'dir' : 'file',
            size: s.isFile() ? s.size : undefined,
            modified: s.mtime.toISOString(),
          };
        } catch {
          return null;
        }
      })
      .filter(Boolean);

    res.json({ entries });
  } catch (err: any) {
    if (err.code === 'ENOENT') {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Path not found' } });
      return;
    }
    res.status(500).json({ error: { code: 'IO_ERROR', message: err.message } });
  }
});

router.get('/:name/files/tree', (req: Request, res: Response) => {
  const name = req.params.name as string;
  const rawDepth = req.query.maxDepth !== undefined ? Number(req.query.maxDepth) : 3;
  const maxDepth = Math.min(Number.isNaN(rawDepth) ? 3 : rawDepth, 5);

  const workspaceBase = resolve(join(getWorkspaceRoot(), name));

  interface TreeFile { name: string; path: string; type: 'file'; size?: number; modified?: string }

  function walkDir(dirPath: string, relPath: string, depth: number): TreeFile[] {
    if (depth > maxDepth) return [];
    try {
      const names = readdirSync(dirPath).filter((n) => !HIDDEN_ENTRIES.has(n) && !n.startsWith('.'));
      const results: TreeFile[] = [];
      for (const n of names) {
        const fullPath = join(dirPath, n);
        try {
          const ls = lstatSync(fullPath);
          if (ls.isSymbolicLink()) continue;
          const s = statSync(fullPath);
          const entryRel = relPath ? `${relPath}/${n}` : n;
          if (s.isDirectory()) {
            results.push(...walkDir(fullPath, entryRel, depth + 1));
          } else if (s.isFile()) {
            results.push({ name: n, path: entryRel, type: 'file', size: s.size, modified: s.mtime.toISOString() });
          }
        } catch { /* skip unreadable entries */ }
      }
      return results;
    } catch { return []; }
  }

  try {
    const stat = statSync(workspaceBase);
    if (!stat.isDirectory()) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Workspace not found' } });
      return;
    }
    const files = walkDir(workspaceBase, '', 0);
    res.json({ files });
  } catch (err: unknown) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === 'ENOENT') {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Workspace not found' } });
      return;
    }
    res.status(500).json({ error: { code: 'IO_ERROR', message: (err as Error).message } });
  }
});

router.get('/:name/file', (req: Request, res: Response) => {
  const name = req.params.name as string;
  const requestedPath = (req.query.path as string) || '';

  if (!requestedPath) {
    res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'path query param required' } });
    return;
  }

  if (requestedPath.length > MAX_PATH_LENGTH) {
    res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Path too long' } });
    return;
  }

  const workspaceBase = resolve(join(getWorkspaceRoot(), name));
  const resolvedPath = resolve(workspaceBase, requestedPath);

  if (!isUnderBase(resolvedPath, workspaceBase)) {
    res.status(400).json({ error: { code: 'PATH_TRAVERSAL', message: 'Path traversal not allowed' } });
    return;
  }

  try {
    const lstat = lstatSync(resolvedPath);
    if (lstat.isSymbolicLink()) {
      res.status(403).json({ error: { code: 'SYMLINK', message: 'Symbolic links are not allowed' } });
      return;
    }
    const stat = statSync(resolvedPath);
    if (!stat.isFile()) {
      res.status(400).json({ error: { code: 'NOT_FILE', message: 'Path is not a file' } });
      return;
    }

    if (stat.size > MAX_FILE_SIZE) {
      res.status(400).json({ error: { code: 'FILE_TOO_LARGE', message: 'File exceeds 1 MB limit' } });
      return;
    }

    const buffer = readFileSync(resolvedPath);
    if (isBinary(buffer)) {
      res.status(400).json({ error: { code: 'BINARY_FILE', message: 'Binary files cannot be read as text' } });
      return;
    }

    res.json({ content: buffer.toString('utf-8') });
  } catch (err: any) {
    if (err.code === 'ENOENT') {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: 'File not found' } });
      return;
    }
    res.status(500).json({ error: { code: 'IO_ERROR', message: err.message } });
  }
});

router.get('/:name/commands', (req: Request, res: Response) => {
  const name = req.params.name as string;
  const workspaceBase = resolve(join(getWorkspaceRoot(), name));
  const commandsDir = resolve(workspaceBase, '.claude', 'commands');

  if (!isUnderBase(commandsDir, workspaceBase)) {
    res.status(400).json({ error: { code: 'PATH_TRAVERSAL', message: 'Path traversal not allowed' } });
    return;
  }

  try {
    const files = readdirSync(commandsDir).filter((f) => f.endsWith('.md'));
    const commands = files.map((f) => {
      try {
        const content = readFileSync(join(commandsDir, f), 'utf-8');
        const firstLine = content.split('\n').find((l) => l.trim())?.replace(/^#+\s*/, '').trim() ?? '';
        return {
          name: f.replace(/\.md$/, ''),
          description: firstLine || f.replace(/\.md$/, ''),
          content,
          hasArguments: content.includes('$ARGUMENTS'),
        };
      } catch {
        return null;
      }
    }).filter(Boolean);
    res.json({ commands });
  } catch (err: any) {
    if (err.code === 'ENOENT') {
      res.json({ commands: [] });
      return;
    }
    res.status(500).json({ error: { code: 'IO_ERROR', message: err.message } });
  }
});

router.put('/:name/file', (req: Request, res: Response) => {
  const name = req.params.name as string;
  const requestedPath = (req.query.path as string) || '';

  if (!requestedPath) {
    res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'path query param required' } });
    return;
  }

  const { content } = req.body;
  if (typeof content !== 'string') {
    res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'content must be a string' } });
    return;
  }

  const workspaceBase = resolve(join(getWorkspaceRoot(), name));
  const resolvedPath = resolve(workspaceBase, requestedPath);

  if (!isUnderBase(resolvedPath, workspaceBase)) {
    res.status(403).json({ error: { code: 'PATH_TRAVERSAL', message: 'Path traversal not allowed' } });
    return;
  }

  try {
    // Check for symlink at target path before writing
    try {
      const lstat = lstatSync(resolvedPath);
      if (lstat.isSymbolicLink()) {
        res.status(403).json({ error: { code: 'SYMLINK', message: 'Writing to symbolic links is not allowed' } });
        return;
      }
    } catch (e: any) {
      if (e.code !== 'ENOENT') throw e;
      // File doesn't exist yet — ensure parent directory exists
      mkdirSync(dirname(resolvedPath), { recursive: true });
    }
    writeFileSync(resolvedPath, content, 'utf-8');
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: { code: 'IO_ERROR', message: err.message } });
  }
});

router.get('/:name/diff', (req: Request, res: Response) => {
  const name = req.params.name as string;
  const requestedPath = (req.query.path as string) || '';

  if (!requestedPath) {
    res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'path query param required' } });
    return;
  }

  if (requestedPath.length > MAX_PATH_LENGTH) {
    res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Path too long' } });
    return;
  }

  const workspaceBase = resolve(join(getWorkspaceRoot(), name));
  const resolvedPath = resolve(workspaceBase, requestedPath);

  if (!isUnderBase(resolvedPath, workspaceBase)) {
    res.status(400).json({ error: { code: 'PATH_TRAVERSAL', message: 'Path traversal not allowed' } });
    return;
  }

  try {
    const lstat = lstatSync(resolvedPath);
    if (lstat.isSymbolicLink()) {
      res.status(403).json({ error: { code: 'SYMLINK', message: 'Symbolic links are not allowed' } });
      return;
    }

    const currentContent = readFileSync(resolvedPath, 'utf-8');

    let originalContent = '';
    try {
      // Use a relative path from the workspace root for git show
      const relPath = requestedPath.replace(/^\//, '');
      originalContent = execSync(`git show HEAD:${relPath}`, {
        cwd: workspaceBase,
        encoding: 'utf-8',
      });
    } catch {
      // File not tracked in git — original is empty
      originalContent = '';
    }

    res.json({ original: originalContent, current: currentContent });
  } catch (err: any) {
    if (err.code === 'ENOENT') {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: 'File not found' } });
      return;
    }
    res.status(500).json({ error: { code: 'IO_ERROR', message: err.message } });
  }
});

export default router;
