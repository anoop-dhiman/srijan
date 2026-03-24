import { Router, Request, Response } from 'express';
import { authMiddleware } from '../security/auth.js';
import { spawn } from 'child_process';

const router = Router();
router.use(authMiddleware);

interface ClaudeCliResult {
  stdout: string;
  stderr: string;
  code: number;
}

function runClaudeCli(args: string[]): Promise<ClaudeCliResult> {
  return new Promise((resolve) => {
    const proc = spawn('claude', args, { env: process.env });
    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', (d: Buffer) => { stdout += d.toString(); });
    proc.stderr.on('data', (d: Buffer) => { stderr += d.toString(); });
    proc.on('close', (code) => {
      resolve({ stdout, stderr, code: code ?? 1 });
    });
    proc.on('error', () => {
      resolve({ stdout, stderr, code: 1 });
    });
  });
}

// GET /api/mcp — list MCP servers
router.get('/', async (_req: Request, res: Response) => {
  const result = await runClaudeCli(['mcp', 'list', '--output-format', 'json']);
  if (result.code !== 0) {
    res.json({ servers: [], error: 'Claude CLI not available' });
    return;
  }
  try {
    const data = JSON.parse(result.stdout.trim());
    res.json({ servers: Array.isArray(data) ? data : (data.servers ?? []) });
  } catch {
    // If output-format json isn't supported, try plain text
    const lines = result.stdout.trim().split('\n').filter(Boolean);
    res.json({ servers: lines });
  }
});

// POST /api/mcp — add an MCP server
router.post('/', async (req: Request, res: Response) => {
  const { name, command, args = [], env = {}, type = 'stdio' } = req.body;
  if (!name || !command) {
    res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'name and command are required' } });
    return;
  }

  const cliArgs = ['mcp', 'add', '--transport', type, name, command, ...args];

  // Add env variables as --env KEY=VALUE flags
  for (const [k, v] of Object.entries(env)) {
    cliArgs.push('--env', `${k}=${v}`);
  }

  const result = await runClaudeCli(cliArgs);
  if (result.code !== 0) {
    res.status(500).json({ error: { code: 'CLI_ERROR', message: result.stderr || 'Failed to add MCP server' } });
    return;
  }
  res.json({ ok: true });
});

// DELETE /api/mcp/:name — remove an MCP server
router.delete('/:name', async (req: Request, res: Response) => {
  const { name } = req.params;
  const result = await runClaudeCli(['mcp', 'remove', name]);
  if (result.code !== 0) {
    res.status(500).json({ error: { code: 'CLI_ERROR', message: result.stderr || 'Failed to remove MCP server' } });
    return;
  }
  res.json({ ok: true });
});

export default router;
