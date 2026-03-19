import { Router, Request, Response } from 'express';
import { authMiddleware } from '../security/auth.js';
import { getWorkspaceRoot } from '../git/manager.js';
import { readdirSync, statSync, readFileSync } from 'fs';
import { join, resolve, sep } from 'path';

const router = Router();
router.use(authMiddleware);

const MAX_FILE_SIZE = 1024 * 1024; // 1 MB

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
  const { name } = req.params;
  const requestedPath = (req.query.path as string) || '';

  const workspaceBase = resolve(join(getWorkspaceRoot(), name));
  const resolvedPath = resolve(workspaceBase, requestedPath);

  if (!isUnderBase(resolvedPath, workspaceBase)) {
    res.status(400).json({ error: { code: 'PATH_TRAVERSAL', message: 'Path traversal not allowed' } });
    return;
  }

  try {
    const stat = statSync(resolvedPath);
    if (!stat.isDirectory()) {
      res.status(400).json({ error: { code: 'NOT_DIRECTORY', message: 'Path is not a directory' } });
      return;
    }

    const names = readdirSync(resolvedPath);
    const entries = names
      .map((n) => {
        try {
          const s = statSync(join(resolvedPath, n));
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

router.get('/:name/file', (req: Request, res: Response) => {
  const { name } = req.params;
  const requestedPath = (req.query.path as string) || '';

  if (!requestedPath) {
    res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'path query param required' } });
    return;
  }

  const workspaceBase = resolve(join(getWorkspaceRoot(), name));
  const resolvedPath = resolve(workspaceBase, requestedPath);

  if (!isUnderBase(resolvedPath, workspaceBase)) {
    res.status(400).json({ error: { code: 'PATH_TRAVERSAL', message: 'Path traversal not allowed' } });
    return;
  }

  try {
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

export default router;
