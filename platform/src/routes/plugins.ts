import { Router, Request, Response } from 'express';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import { authMiddleware, requireAdmin } from '../security/auth.js';
import { getApiKey } from '../agent/runner.js';

const router = Router();
router.use(authMiddleware);
router.use(requireAdmin);

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const CLAUDE_BIN = resolve(__dirname, '../../node_modules/@anthropic-ai/claude-code/cli.js');

// Allowlist: only alphanumeric, hyphens, underscores, @, dots, slashes
// Note: '-' is placed at the end of the character class to avoid being treated as a range operator
const PLUGIN_ID_RE = /^[\w@./+\-]+$/;

function runPluginCmd(args: string[]): Promise<string> {
  const env: Record<string, string> = { ...(process.env as Record<string, string>) };
  const key = getApiKey();
  if (key) env['ANTHROPIC_API_KEY'] = key;
  if (!env['HOME']) env['HOME'] = '/home/node';
  if (!env['SHELL']) env['SHELL'] = '/bin/sh';

  return new Promise((resolve, reject) => {
    const proc = spawn(process.execPath, [CLAUDE_BIN, 'plugin', ...args], {
      env,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    // Feed 'y\n' to auto-confirm any interactive Y/n prompts
    // (claude plugin install has no --yes flag)
    proc.stdin.write('y\n');
    proc.stdin.end();

    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', (d: Buffer) => { stdout += d.toString(); });
    proc.stderr.on('data', (d: Buffer) => { stderr += d.toString(); });

    const timer = setTimeout(() => {
      proc.kill();
      reject(new Error('Plugin command timed out after 120s'));
    }, 120_000);

    proc.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) {
        resolve(stdout);
      } else {
        const err = new Error(stderr.trim() || stdout.trim() || `Exit code ${code}`);
        (err as any).stderr = stderr;
        (err as any).stdout = stdout;
        reject(err);
      }
    });

    proc.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

/**
 * Ensure the official Anthropic plugin marketplace is registered and its
 * catalog is up to date. Called at server startup — runs async, never throws.
 */
export async function ensureOfficialMarketplace(): Promise<void> {
  try {
    const stdout = await runPluginCmd(['marketplace', 'list', '--json']);
    const list: { name: string }[] = JSON.parse(stdout.trim() || '[]');
    if (!list.some((m) => m.name === 'claude-plugins-official')) {
      // Not registered — add it (GitHub shorthand) before updating
      await runPluginCmd(['marketplace', 'add', 'anthropics/claude-plugins-official']);
    }
    // Always update to fetch/refresh the plugin catalog from GitHub
    await runPluginCmd(['marketplace', 'update', 'claude-plugins-official']);
  } catch {
    // Non-fatal: may fail in air-gapped environments
  }
}

// POST /api/plugins/marketplace/refresh — update all marketplace catalogs
router.post('/marketplace/refresh', async (_req: Request, res: Response) => {
  try {
    await runPluginCmd(['marketplace', 'update']);
    res.json({ ok: true });
  } catch (err: any) {
    const detail = (err.stderr || err.stdout || err.message || '').toString().trim();
    res.status(500).json({ error: { code: 'PLUGIN_ERROR', message: detail || err.message } });
  }
});

// GET /api/plugins — list installed plugins
router.get('/', async (_req: Request, res: Response) => {
  try {
    const stdout = await runPluginCmd(['list', '--json']);
    const plugins = JSON.parse(stdout.trim() || '[]');
    res.json(plugins);
  } catch (err: any) {
    // If no plugins installed, the command may output [] or fail gracefully
    if (err.stdout?.trim()) {
      try { return res.json(JSON.parse(err.stdout.trim())); } catch {}
    }
    res.status(500).json({ error: { code: 'PLUGIN_ERROR', message: err.message } });
  }
});

// POST /api/plugins — install { id: "plugin-name@marketplace" }
router.post('/', async (req: Request, res: Response) => {
  const { id } = req.body as { id?: string };
  if (!id || typeof id !== 'string' || !PLUGIN_ID_RE.test(id)) {
    res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Valid plugin id required' } });
    return;
  }
  try {
    await runPluginCmd(['install', id]);
  } catch (firstErr: any) {
    const msg: string = (firstErr.stderr || firstErr.stdout || firstErr.message || '').toString();
    // If the catalog doesn't have the plugin yet, refresh the marketplace and retry once
    if (msg.toLowerCase().includes('not found in marketplace')) {
      try {
        await runPluginCmd(['marketplace', 'update']);
        await runPluginCmd(['install', id]);
      } catch (retryErr: any) {
        const detail = (retryErr.stderr || retryErr.stdout || retryErr.message || '').toString().trim();
        res.status(500).json({ error: { code: 'PLUGIN_ERROR', message: detail || retryErr.message } });
        return;
      }
    } else {
      const detail = msg.trim();
      res.status(500).json({ error: { code: 'PLUGIN_ERROR', message: detail || firstErr.message } });
      return;
    }
  }
  try {
    const stdout = await runPluginCmd(['list', '--json']);
    res.json(JSON.parse(stdout.trim() || '[]'));
  } catch {
    res.json([]);
  }
});

// POST /api/plugins/:id/enable
router.post('/:id/enable', async (req: Request, res: Response) => {
  const id = decodeURIComponent(req.params.id as string);
  if (!PLUGIN_ID_RE.test(id)) {
    res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Invalid plugin id' } });
    return;
  }
  try {
    await runPluginCmd(['enable', id]);
    res.json({ ok: true });
  } catch (err: any) {
    const detail = (err.stderr || err.stdout || err.message || '').toString().trim();
    res.status(500).json({ error: { code: 'PLUGIN_ERROR', message: detail || err.message } });
  }
});

// POST /api/plugins/:id/disable
router.post('/:id/disable', async (req: Request, res: Response) => {
  const id = decodeURIComponent(req.params.id as string);
  if (!PLUGIN_ID_RE.test(id)) {
    res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Invalid plugin id' } });
    return;
  }
  try {
    await runPluginCmd(['disable', id]);
    res.json({ ok: true });
  } catch (err: any) {
    const detail = (err.stderr || err.stdout || err.message || '').toString().trim();
    res.status(500).json({ error: { code: 'PLUGIN_ERROR', message: detail || err.message } });
  }
});

// DELETE /api/plugins/:id — uninstall
router.delete('/:id', async (req: Request, res: Response) => {
  const id = decodeURIComponent(req.params.id as string);
  if (!PLUGIN_ID_RE.test(id)) {
    res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Invalid plugin id' } });
    return;
  }
  try {
    await runPluginCmd(['uninstall', id]);
    res.json({ ok: true });
  } catch (err: any) {
    const detail = (err.stderr || err.stdout || err.message || '').toString().trim();
    res.status(500).json({ error: { code: 'PLUGIN_ERROR', message: detail || err.message } });
  }
});

export default router;
