import { WebSocketServer, WebSocket } from 'ws';
import { IncomingMessage } from 'http';
import { createSession, getSession, listSessions, getSessionEvents, deleteSession, updateSessionTitle, createSessionAgent, getSessionAgents } from '../agent/session.js';
import { getRunner, getApiKey, getModel, getVertexConfig, getLiteLLMConfig, getOAuthToken, type RoleConfig } from '../agent/runner.js';
import { getOrCreateAgent, getAgent, getAllAgents, removeSession } from '../agent/AgentRegistry.js';
import { getDb } from '../db/store.js';
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

    function attachForwarder(sessionId: string, agentId: string, runner: any) {
      const key = `${sessionId}:${agentId}`;
      if (forwarders.has(key)) return;
      const handler = (evt: any) => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'agent_event', data: evt }));
        }
      };
      forwarders.set(key, handler);
      runner.on('event', handler);
    }

    function detachAll() {
      for (const [key, handler] of forwarders) {
        const colonIdx = key.indexOf(':');
        const sessionId = key.slice(0, colonIdx);
        const agentId = key.slice(colonIdx + 1);
        const agentRunner = getAgent(sessionId, agentId);
        if (agentRunner) agentRunner.off('event', handler);
        // Also try legacy single-runner path for backwards compat
        const legacyRunner = getRunner(sessionId);
        if (legacyRunner) legacyRunner.off('event', handler);
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
            // Re-attach forwarders for all live agents in this session
            const liveAgents = getAllAgents(session.id);
            for (const [agentId, { runner: agentRunner }] of liveAgents) {
              attachForwarder(session.id, agentId, agentRunner);
            }
            const events = getSessionEvents(session.id);
            ws.send(JSON.stringify({ type: 'session_joined', data: { session, events } }));
            // Also send agents list
            const agentsList = getSessionAgents(session.id);
            ws.send(JSON.stringify({ type: 'agents_list', data: agentsList }));
            break;
          }

          case 'delete_session': {
            const session = getSession(msg.sessionId);
            if (!session || session.userId !== user.userId) {
              ws.send(JSON.stringify({ type: 'error', data: { message: 'Session not found' } }));
              break;
            }
            deleteSession(msg.sessionId);
            removeSession(msg.sessionId); // abort and remove all agents from registry
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
            const oauthToken = getOAuthToken(user.userId);

            if (!vertexConfig.useVertex && !litellmConfig.useLiteLLM && !apiKey && !oauthToken) {
              ws.send(
                JSON.stringify({
                  type: 'error',
                  data: { message: 'No API key configured. Go to Settings to add your Anthropic API key, configure Vertex AI, or connect a Claude account.' },
                })
              );
              break;
            }

            const session = getSession(currentSessionId)!;
            const wsName = session.workspaceName || currentSessionId;

            // Parse @mention from message content.
            // Priority: session agent name > role name > no-op (use default)
            let messageContent: string = msg.content;
            let activeRoleConfig: RoleConfig | undefined;

            // --- Multi-agent routing ---
            let targetAgentName = 'default';
            let targetAgentDbId: string | null = null;
            let targetClaudeSessionId: string | null = null;

            const rawMentionMatch = messageContent.match(/^@([a-z][a-z0-9_-]*)\s+([\s\S]*)/i);
            if (rawMentionMatch) {
              const mentionName = rawMentionMatch[1].toLowerCase();

              // Check session agents first
              const existingAgents = getSessionAgents(currentSessionId!);
              const matchedAgent = existingAgents.find((a: any) => a.name === mentionName);

              if (matchedAgent) {
                // Route to named session agent — strip @mention, no role override
                targetAgentName = matchedAgent.name;
                targetAgentDbId = matchedAgent.id;
                targetClaudeSessionId = matchedAgent.claude_session_id || null;
                messageContent = rawMentionMatch[2];
                activeRoleConfig = undefined;

                ws.send(JSON.stringify({
                  type: 'agent_event',
                  data: {
                    sessionId: currentSessionId,
                    type: 'role_switched',
                    data: { role: mentionName, displayName: matchedAgent.display_name, isAgent: true },
                  },
                }));
              } else {
                // Fall back to Phase C role lookup
                const db = getDb();
                const role = db.prepare('SELECT * FROM agent_roles WHERE name = ?').get(mentionName) as any;
                if (role) {
                  messageContent = rawMentionMatch[2];
                  activeRoleConfig = {
                    name: role.name,
                    displayName: role.display_name,
                    systemPromptAddition: role.system_prompt_addition || '',
                    allowedTools: role.allowed_tools ? JSON.parse(role.allowed_tools) : null,
                    subdirOverride: role.subdir || '',
                  };
                  ws.send(JSON.stringify({
                    type: 'agent_event',
                    data: {
                      sessionId: currentSessionId,
                      type: 'role_switched',
                      data: { role: role.name, displayName: role.display_name },
                    },
                  }));
                }
                // If neither matched, message is sent as-is to the default agent
              }
            }

            // Ensure a default session_agents DB record exists for the default agent
            if (targetAgentName === 'default') {
              const existingAgents = getSessionAgents(currentSessionId!);
              let defaultAgent = existingAgents.find((a: any) => a.name === 'default');
              if (!defaultAgent) {
                defaultAgent = createSessionAgent({
                  sessionId: currentSessionId!,
                  name: 'default',
                  displayName: 'Default',
                  roleId: null,
                  subdir: '',
                });
              }
              targetAgentDbId = defaultAgent.id;
              targetClaudeSessionId = defaultAgent.claude_session_id || null;
            }

            // Get or create the agent runner via AgentRegistry
            const runner = getOrCreateAgent({
              sessionId: currentSessionId!,
              agentDbId: targetAgentDbId!,
              agentId: targetAgentName,
              workspaceName: wsName,
              subdir: activeRoleConfig?.subdirOverride || '',
              apiKey,
              model: getModel(),
              vertexConfig,
              litellmConfig,
              userId: user.userId,
              roleConfig: activeRoleConfig,
              claudeSessionId: targetClaudeSessionId,
            });

            // Attach persistent forwarder keyed by sessionId:agentId (idempotent)
            attachForwarder(currentSessionId!, targetAgentName, runner);

            // Option C: immediately set title from first message, then refine with LLM
            const isFirstMessage = !titledSessions.has(currentSessionId!) && session.title === 'New Session';
            if (isFirstMessage) {
              const quickTitle = messageContent.trim().slice(0, 60);
              updateSessionTitle(currentSessionId!, quickTitle);
              const updated = getSession(currentSessionId!)!;
              ws.send(JSON.stringify({ type: 'session_updated', data: updated }));
            }

            await runner.sendMessage(messageContent, typeof msg.thinkingBudget === 'number' ? msg.thinkingBudget : undefined);

            // After first turn completes, generate a better LLM title (fire-and-forget)
            if (isFirstMessage) {
              titledSessions.add(currentSessionId!);
              const sid = currentSessionId!;
              generateTitle(messageContent, apiKey).then((llmTitle) => {
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
              // Abort all named agents in the session
              const allAgents = getAllAgents(currentSessionId);
              for (const [, { runner: r }] of allAgents) {
                r.abort();
              }
              // Also abort legacy single-runner for backwards compat
              const legacyRunner = getRunner(currentSessionId);
              if (legacyRunner) legacyRunner.abort();
            }
            break;
          }

          case 'list_agents': {
            if (!currentSessionId) {
              ws.send(JSON.stringify({ type: 'error', data: { message: 'No active session' } }));
              break;
            }
            const dbAgents = getSessionAgents(currentSessionId);
            const allLiveAgents = getAllAgents(currentSessionId);
            const enriched = dbAgents.map((a: any) => ({
              ...a,
              status: allLiveAgents.has(a.name) ? 'active' : a.status,
            }));
            ws.send(JSON.stringify({ type: 'agents_list', data: enriched }));
            break;
          }

          case 'create_agent': {
            if (!currentSessionId) {
              ws.send(JSON.stringify({ type: 'error', data: { message: 'No active session' } }));
              break;
            }
            const { name: agentName, displayName: agentDisplayName, roleId, subdir } = msg;
            if (!agentName || typeof agentName !== 'string' || !/^[a-z][a-z0-9_-]*$/.test(agentName)) {
              ws.send(JSON.stringify({ type: 'error', data: { message: 'Invalid agent name' } }));
              break;
            }
            const newAgent = createSessionAgent({
              sessionId: currentSessionId,
              name: agentName,
              displayName: agentDisplayName || agentName,
              roleId: roleId || null,
              subdir: subdir || '',
            });
            ws.send(JSON.stringify({ type: 'agent_created', data: newAgent }));
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
