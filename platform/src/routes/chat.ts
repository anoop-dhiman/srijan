import { WebSocketServer, WebSocket } from 'ws';
import { IncomingMessage } from 'http';
import { join } from 'path';
import { createSession, getSession, listSessions, getSessionEvents, deleteSession } from '../agent/session.js';
import { getOrCreateRunner, getApiKey, getModel, getVertexConfig } from '../agent/runner.js';
import { getWorkspaceRoot } from '../git/manager.js';

export const chatWss = new WebSocketServer({ noServer: true });

// Called by server.ts upgrade dispatcher after auth is verified
export function setupWebSocket(): void {
  chatWss.on('connection', (ws: WebSocket, _req: IncomingMessage, user: any, sessionToken: string) => {
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
            const session = createSession(user.userId, msg.title, msg.workspaceName);
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

          case 'delete_session': {
            const session = getSession(msg.sessionId);
            if (!session || session.userId !== user.userId) {
              ws.send(JSON.stringify({ type: 'error', data: { message: 'Session not found' } }));
              break;
            }
            deleteSession(msg.sessionId);
            if (currentSessionId === msg.sessionId) currentSessionId = null;
            ws.send(JSON.stringify({ type: 'session_deleted', data: { sessionId: msg.sessionId } }));
            break;
          }

          case 'message': {
            if (!currentSessionId) {
              const session = createSession(user.userId);
              currentSessionId = session.id;
              ws.send(JSON.stringify({ type: 'session_created', data: session }));
            }

            const vertexConfig = getVertexConfig();
            const apiKey = vertexConfig.useVertex ? '' : getApiKey();

            if (!vertexConfig.useVertex && !apiKey) {
              ws.send(
                JSON.stringify({
                  type: 'error',
                  data: { message: 'No API key configured. Go to Settings to add your Anthropic API key or configure Vertex AI.' },
                })
              );
              break;
            }

            const session = getSession(currentSessionId)!;
            const wsName = session.workspaceName || currentSessionId;
            const runner = getOrCreateRunner({
              sessionId: currentSessionId,
              workspacePath: join(getWorkspaceRoot(), wsName),
              apiKey,
              model: getModel(),
              sessionToken,
              vertexConfig,
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

