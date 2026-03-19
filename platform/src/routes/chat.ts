import { WebSocketServer, WebSocket } from 'ws';
import { IncomingMessage, Server } from 'http';
import { parse } from 'url';
import { join } from 'path';
import { verifyToken } from '../security/auth.js';
import { createSession, getSession, listSessions, getSessionEvents } from '../agent/session.js';
import { getOrCreateRunner, getApiKey, getModel } from '../agent/runner.js';
import { getWorkspaceRoot } from '../git/manager.js';

export function setupWebSocket(server: Server): void {
  const wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', (request: IncomingMessage, socket, head) => {
    const { pathname, query } = parse(request.url || '', true);

    if (pathname !== '/api/chat') {
      socket.destroy();
      return;
    }

    // Auth via query param token (WebSocket can't use headers easily)
    const token = query.token as string;
    if (!token) {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
      return;
    }

    const payload = verifyToken(token);
    if (!payload) {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
      return;
    }

    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit('connection', ws, request, payload, token);
    });
  });

  wss.on('connection', (ws: WebSocket, _req: IncomingMessage, user: any, sessionToken: string) => {
    let currentSessionId: string | null = null;

    ws.on('message', async (data: Buffer) => {
      try {
        const msg = JSON.parse(data.toString());

        switch (msg.type) {
          case 'list_sessions': {
            const sessions = listSessions(user.userId);
            ws.send(JSON.stringify({ type: 'sessions', data: sessions }));
            break;
          }

          case 'new_session': {
            const session = createSession(user.userId, msg.title);
            currentSessionId = session.id;
            ws.send(JSON.stringify({ type: 'session_created', data: session }));
            break;
          }

          case 'join_session': {
            const session = getSession(msg.sessionId);
            if (!session) {
              ws.send(JSON.stringify({ type: 'error', data: { message: 'Session not found' } }));
              break;
            }
            currentSessionId = session.id;
            const events = getSessionEvents(session.id);
            ws.send(JSON.stringify({ type: 'session_joined', data: { session, events } }));
            break;
          }

          case 'message': {
            if (!currentSessionId) {
              // Auto-create session
              const session = createSession(user.userId);
              currentSessionId = session.id;
              ws.send(JSON.stringify({ type: 'session_created', data: session }));
            }

            const apiKey = getApiKey();
            if (!apiKey) {
              ws.send(
                JSON.stringify({
                  type: 'error',
                  data: { message: 'No API key configured. Go to Settings > LLM to add your Anthropic API key.' },
                })
              );
              break;
            }

            const runner = getOrCreateRunner({
              sessionId: currentSessionId,
              workspacePath: join(getWorkspaceRoot(), currentSessionId),
              apiKey,
              model: getModel(),
              sessionToken,
            });

            // Pipe agent events to WebSocket
            const eventHandler = (event: any) => {
              if (ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ type: 'agent_event', data: event }));
              }
            };
            runner.on('event', eventHandler);

            await runner.sendMessage(msg.content);

            runner.off('event', eventHandler);
            break;
          }

          default:
            ws.send(JSON.stringify({ type: 'error', data: { message: `Unknown message type: ${msg.type}` } }));
        }
      } catch (err: any) {
        ws.send(JSON.stringify({ type: 'error', data: { message: err.message } }));
      }
    });

    ws.on('close', () => {
      currentSessionId = null;
    });
  });
}
