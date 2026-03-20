import { WebSocketServer, WebSocket } from 'ws';
import * as pty from 'node-pty';
import { getWorkspaceRoot } from '../git/manager.js';
import { getSession } from '../agent/session.js';
import { join } from 'path';

export const terminalWss = new WebSocketServer({ noServer: true });

const SENSITIVE_ENV_PREFIXES = ['SRIJAN_', 'ANTHROPIC_', 'GOOGLE_', 'VERTEX_'];
const SENSITIVE_ENV_KEYS = new Set(['HTTP_PROXY', 'HTTPS_PROXY', 'CLOUD_ML_REGION', 'CLAUDE_CODE_USE_VERTEX']);

function buildCleanEnv(): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (value === undefined) continue;
    if (SENSITIVE_ENV_KEYS.has(key)) continue;
    if (SENSITIVE_ENV_PREFIXES.some((prefix) => key.startsWith(prefix))) continue;
    env[key] = value;
  }
  return env;
}

function clampDim(value: unknown, defaultVal: number): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 1) return defaultVal;
  return Math.min(Math.floor(n), 500);
}

export function setupTerminal(): void {
  terminalWss.on('connection', (ws: WebSocket, _req: any, _user: any, sessionId: string) => {
    // Determine workspace directory for this session
    let cwd = getWorkspaceRoot();
    if (sessionId) {
      const session = getSession(sessionId);
      if (session) {
        const wsName = session.workspaceName || session.id;
        cwd = join(getWorkspaceRoot(), wsName);
      }
    }

    let ptyProc: ReturnType<typeof pty.spawn>;
    try {
      ptyProc = pty.spawn('bash', [], {
        name: 'xterm-256color',
        cols: 80,
        rows: 24,
        cwd,
        env: buildCleanEnv(),
      });
    } catch (err: any) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(`\r\nTerminal unavailable: ${err.message}\r\n`);
        ws.close();
      }
      return;
    }

    ptyProc.onData((data) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(data);
      }
    });

    ptyProc.onExit(() => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.close();
      }
    });

    ws.on('message', (data: Buffer) => {
      try {
        const msg = JSON.parse(data.toString());
        if (msg.type === 'input') {
          ptyProc.write(msg.data);
        } else if (msg.type === 'resize') {
          const cols = clampDim(msg.cols, 80);
          const rows = clampDim(msg.rows, 24);
          ptyProc.resize(cols, rows);
        }
      } catch {
        // raw input (not JSON) — treat as direct input
        ptyProc.write(data.toString());
      }
    });

    ws.on('close', () => {
      ptyProc.kill();
    });
  });
}
