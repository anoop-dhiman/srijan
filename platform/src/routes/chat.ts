import { WebSocketServer, WebSocket } from 'ws';
import { IncomingMessage } from 'http';
import { join } from 'path';
import { createSession, getSession, listSessions, getSessionEvents, deleteSession, updateSessionTitle } from '../agent/session.js';
import { getOrCreateRunner, getRunner, getApiKey, getModel, getVertexConfig, getLiteLLMConfig } from '../agent/runner.js';
import { getWorkspaceRoot } from '../git/manager.js';
import { generateTitle } from '../lib/titleGenerator.js';

// Track sessions that have had LLM title generation attempted (per process lifetime)
const titledSessions = new Set<string>();

const SAFE_WORKSPACE_NAME_RE = /^[a-zA-Z0-9_-]+$/;

function isValidWorkspaceName(name: unknown): name is string {
  return typeof name === 'string' && SAFE_WORKSPACE_NAME_RE.test(name);
}

export const chatWss = new WebSocketServer({ noServer: true });

// Called by server.ts upgrade dispatcher after auth is verified
export function setupWebSocket(): void {
  chatWss.on('connection', (ws: WebSocket, _req: IncomingMessage, user: any, sessionToken: string) => {
    let currentSessionId: string | null = null;
    const forwarders = new Map<string, (evt: any) => void>();

    function attachForwarder(sessionId: string) {
      if (forwarders.has(sessionId)) return;
      const runner = getRunner(sessionId);
      if (!runner) return;
      const handler = (evt: any) => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'agent_event', data: evt }));
        }
      };
      forwarders.set(sessionId, handler);
      runner.on('event', handler);
    }

    function detachAll() {
      for (const [sessionId, handler] of forwarders) {
        const runner = getRunner(sessionId);
        if (runner) runner.off('event', handler);
      }
      forwarders.clear();
    }

    ws.on('message', async (data: Buffer) => {
      try {
        const msg = JSON.parse(data.toString());

        if (!msg || typeof msg.type !== 'string') {
          ws.send(JSON.stringify({ type: 'error', data: { message: 'Invalid message: type field required' } }));
          return;
        }

        switch (msg.type) {
          case 'list_sessions': {
            const sessions = listSessions(user.userId);
            ws.send(JSON.stringify({ type: 'sessions', data: sessions }));
            break;
          }

          case 'new_session': {
            if (!msg.workspaceName) {
              ws.send(JSON.stringify({ type: 'error', data: { message: 'A workspace must be selected before starting a new session.' } }));
              break;
            }
            if (!isValidWorkspaceName(msg.workspaceName)) {
              ws.send(JSON.stringify({ type: 'error', data: { message: 'Invalid workspace name' } }));
              break;
            }
            const session = createSession(user.userId, msg.title, msg.workspaceName);
            currentSessionId = session.id;
            ws.send(JSON.stringify({ type: 'session_created', data: session }));
            // Runner doesn't exist yet; forwarder will be attached on first message
            break;
          }

          case 'join_session': {
            const session = getSession(msg.sessionId);
            if (!session || session.userId !== user.userId) {
              ws.send(JSON.stringify({ type: 'error', data: { message: 'Session not found' } }));
              break;
            }
            currentSessionId = session.id;
            attachForwarder(session.id);
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
            if (!currentSessionId && !msg.workspaceName) {
              ws.send(JSON.stringify({ type: 'error', data: { message: 'A workspace must be selected before sending a message.' } }));
              break;
            }
            if (!currentSessionId && !isValidWorkspaceName(msg.workspaceName)) {
              ws.send(JSON.stringify({ type: 'error', data: { message: 'Invalid workspace name' } }));
              break;
            }
            if (!currentSessionId) {
              const session = createSession(user.userId, undefined, msg.workspaceName);
              currentSessionId = session.id;
              ws.send(JSON.stringify({ type: 'session_created', data: session }));
            }

            const vertexConfig = getVertexConfig();
            const litellmConfig = getLiteLLMConfig();
            const apiKey = (vertexConfig.useVertex || litellmConfig.useLiteLLM) ? '' : getApiKey();

            if (!vertexConfig.useVertex && !litellmConfig.useLiteLLM && !apiKey) {
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
              workspaceName: session.workspaceName || undefined,
              apiKey,
              model: getModel(),
              vertexConfig,
              litellmConfig,
              userId: user.userId,
            });

            // Attach persistent forwarder (idempotent — no-op if already attached)
            attachForwarder(currentSessionId);

            // Option C: immediately set title from first message, then refine with LLM
            const isFirstMessage = !titledSessions.has(currentSessionId) && session.title === 'New Session';
            if (isFirstMessage) {
              const quickTitle = msg.content.trim().slice(0, 60);
              updateSessionTitle(currentSessionId, quickTitle);
              const updated = getSession(currentSessionId)!;
              ws.send(JSON.stringify({ type: 'session_updated', data: updated }));
            }

            await runner.sendMessage(msg.content);

            // After first turn completes, generate a better LLM title (fire-and-forget)
            if (isFirstMessage) {
              titledSessions.add(currentSessionId);
              const sid = currentSessionId;
              generateTitle(msg.content, apiKey).then((llmTitle) => {
                updateSessionTitle(sid, llmTitle);
                const refreshed = getSession(sid);
                if (refreshed && ws.readyState === WebSocket.OPEN) {
                  ws.send(JSON.stringify({ type: 'session_updated', data: refreshed }));
                }
              }).catch(() => { /* non-fatal */ });
            }
            break;
          }

          case 'abort_session': {
            if (currentSessionId) {
              const runner = getRunner(currentSessionId);
              if (runner) runner.abort();
            }
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
      detachAll();
      currentSessionId = null;
    });
  });
}
