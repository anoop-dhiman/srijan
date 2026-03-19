import { WebSocketServer, WebSocket } from 'ws';
import * as pty from 'node-pty';
import { getWorkspaceRoot } from '../git/manager.js';
import { getSession } from '../agent/session.js';
import { join } from 'path';

export const terminalWss = new WebSocketServer({ noServer: true });

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

    const ptyProc = pty.spawn('bash', [], {
      name: 'xterm-256color',
      cols: 80,
      rows: 24,
      cwd,
      env: process.env as Record<string, string>,
    });

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
          ptyProc.resize(msg.cols, msg.rows);
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
