import { useState, useCallback, useRef, useEffect } from 'react';
import { createChatSocket, apiFetch } from '../lib/api';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  streaming?: boolean;
  timestamp: number;
  toolName?: string;
  toolInput?: any;
  toolResult?: string;
  toolStatus?: 'running' | 'done' | 'error';
}

export interface Session {
  id: string;
  title: string;
  status: string;
  workspaceName: string | null;
  createdAt: string;
}

export interface WorkspaceInfo {
  name: string;
  sessionCount: number;
  runningContainerCount: number;
  totalCostUsd: number | null;
  lastActivityAt: string | null;
}

export interface SessionActivity {
  isLoading: boolean;
  agentStatus: string;
  hasUnread: boolean;
}

const DEFAULT_ACTIVITY: SessionActivity = { isLoading: false, agentStatus: '', hasUnread: false };

function formatToolLabel(name: string, input: any): string {
  switch (name) {
    case 'Read': return `Reading ${input?.file_path || 'file'}`;
    case 'Write': return `Writing ${input?.file_path || 'file'}`;
    case 'Edit': return `Editing ${input?.file_path || 'file'}`;
    case 'Bash': {
      const cmd = input?.command || '';
      const short = cmd.length > 80 ? cmd.slice(0, 80) + '…' : cmd;
      return `Running: ${short}`;
    }
    case 'Grep': return `Searching for "${input?.pattern || '...'}"`;
    case 'Glob': return `Finding files: ${input?.pattern || '...'}`;
    case 'Agent': return 'Delegating to sub-agent';
    default: return `Using ${name}`;
  }
}

const RECONNECT_BASE_MS = 3000;
const RECONNECT_MAX_MS = 60000;
const MAX_RECONNECT_ATTEMPTS = 10;

function genId(): string {
  return typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);
}

export function useChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [currentSession, setCurrentSession] = useState<Session | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [sessionActivity, setSessionActivity] = useState<Record<string, SessionActivity>>({});
  const [sessionCosts, setSessionCosts] = useState<Record<string, number>>({});
  const [workspaces, setWorkspaces] = useState<WorkspaceInfo[]>([]);
  const [currentWorkspace, setCurrentWorkspaceState] = useState<string | null>(
    () => localStorage.getItem('srijan_workspace')
  );

  const wsRef = useRef<WebSocket | null>(null);
  const streamBufferRef = useRef('');
  const currentSessionRef = useRef<Session | null>(null);
  const currentWorkspaceRef = useRef<string | null>(currentWorkspace);
  const reconnectAttemptRef = useRef(0);

  // Keep refs in sync with state
  currentSessionRef.current = currentSession;
  currentWorkspaceRef.current = currentWorkspace;

  const setCurrentWorkspace = useCallback((name: string | null) => {
    setCurrentWorkspaceState(name);
    if (name) localStorage.setItem('srijan_workspace', name);
    else localStorage.removeItem('srijan_workspace');
  }, []);

  const fetchWorkspaces = useCallback(async () => {
    try {
      const list = await apiFetch('/workspaces');
      setWorkspaces(list);
    } catch { /* non-fatal */ }
  }, []);

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    const ws = createChatSocket();
    wsRef.current = ws;

    ws.onopen = () => {
      setIsConnected(true);
      reconnectAttemptRef.current = 0;
      ws.send(JSON.stringify({ type: 'list_sessions' }));
      fetchWorkspaces();
    };

    const savedSessionId = localStorage.getItem('srijan_session_id');

    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);

      switch (msg.type) {
        case 'sessions': {
          setSessions(msg.data);
          // Fetch costs for all sessions
          for (const s of msg.data as Session[]) {
            apiFetch(`/sessions/${s.id}/cost`).then((row: any) => {
              if (row && row.cost_usd != null) {
                setSessionCosts((prev) => ({ ...prev, [s.id]: row.cost_usd }));
              }
            }).catch(() => {});
          }
          // Auto-rejoin last session on reconnect
          if (savedSessionId && msg.data.some((s: Session) => s.id === savedSessionId)) {
            ws.send(JSON.stringify({ type: 'join_session', sessionId: savedSessionId }));
          }
          break;
        }

        case 'session_created':
          setCurrentSession(msg.data);
          setSessions((prev) => [msg.data, ...prev]);
          localStorage.setItem('srijan_session_id', msg.data.id);
          break;

        case 'session_joined': {
          setCurrentSession(msg.data.session);
          localStorage.setItem('srijan_session_id', msg.data.session.id);
          // R8: clear any in-progress stream buffer from the previous session
          streamBufferRef.current = '';
          // Clear unread for joined session
          setSessionActivity(prev => {
            const cur = prev[msg.data.session.id] || DEFAULT_ACTIVITY;
            return { ...prev, [msg.data.session.id]: { ...cur, hasUnread: false } };
          });
          // Restore events as messages
          const restored: ChatMessage[] = [];
          for (const e of msg.data.events) {
            if (e.type === 'user_message') {
              restored.push({
                id: `restored-${restored.length}`,
                role: 'user',
                content: e.data.content,
                timestamp: new Date(e.created_at).getTime(),
              });
            } else if (e.type === 'agent_response' && !e.data?.streaming) {
              restored.push({
                id: `restored-${restored.length}`,
                role: 'assistant',
                content: e.data.content,
                timestamp: new Date(e.created_at).getTime(),
              });
            } else if (e.type === 'tool_use') {
              restored.push({
                id: `restored-${restored.length}`,
                role: 'tool',
                content: formatToolLabel(e.data.name, e.data.input),
                toolName: e.data.name,
                toolInput: e.data.input,
                toolStatus: 'done',
                timestamp: new Date(e.created_at).getTime(),
              });
            } else if (e.type === 'tool_result') {
              for (let j = restored.length - 1; j >= 0; j--) {
                if (restored[j].role === 'tool' && !restored[j].toolResult) {
                  restored[j].toolResult = e.data.content || '';
                  if (e.data.isError) restored[j].toolStatus = 'error';
                  break;
                }
              }
            } else if (e.type === 'error') {
              restored.push({
                id: `restored-${restored.length}`,
                role: 'system',
                content: e.data.message,
                timestamp: new Date(e.created_at).getTime(),
              });
            }
          }
          setMessages(restored);
          break;
        }

        case 'session_deleted': {
          const deletedId = msg.data.sessionId;
          setSessions((prev) => prev.filter((s) => s.id !== deletedId));
          setCurrentSession((prev) => {
            if (prev?.id === deletedId) {
              setMessages([]);
              localStorage.removeItem('srijan_session_id');
              return null;
            }
            return prev;
          });
          break;
        }

        case 'agent_event': {
          const evt = msg.data;
          const sid: string = evt.sessionId;

          // Update per-session activity state
          setSessionActivity(prev => {
            const cur = prev[sid] || DEFAULT_ACTIVITY;
            let updated = { ...cur };

            if (evt.type === 'session_start') {
              updated.isLoading = true;
              updated.agentStatus = 'Connecting to agent…';
            }
            if (evt.type === 'agent_response') {
              if (evt.data.streaming) { updated.isLoading = true; updated.agentStatus = 'Writing…'; }
              if (evt.data.done) { updated.isLoading = false; updated.agentStatus = ''; }
            }
            if (evt.type === 'tool_use') {
              updated.isLoading = true;
              updated.agentStatus = formatToolLabel(evt.data.name, evt.data.input);
            }
            if (evt.type === 'tool_result') {
              updated.agentStatus = 'Thinking…';
            }
            if (evt.type === 'error') {
              updated.isLoading = false;
              updated.agentStatus = '';
            }

            // Mark unread for sessions that aren't currently active
            if (sid !== currentSessionRef.current?.id) {
              updated.hasUnread = true;
            }

            return { ...prev, [sid]: updated };
          });

          // Only update messages / streaming for the active session
          if (sid !== currentSessionRef.current?.id) break;

          if (evt.type === 'agent_response') {
            if (evt.data.streaming) {
              streamBufferRef.current += evt.data.content;
              setMessages((prev) => {
                const last = prev[prev.length - 1];
                if (last?.streaming) {
                  return [
                    ...prev.slice(0, -1),
                    { ...last, content: streamBufferRef.current },
                  ];
                }
                return [
                  ...prev,
                  {
                    id: genId(),
                    role: 'assistant',
                    content: streamBufferRef.current,
                    streaming: true,
                    timestamp: Date.now(),
                  },
                ];
              });
            }
            if (evt.data.done) {
              const finalContent = streamBufferRef.current || evt.data.content || '';
              streamBufferRef.current = '';
              setMessages((prev) => {
                const last = prev[prev.length - 1];
                if (last?.streaming) {
                  return [...prev.slice(0, -1), { ...last, content: finalContent, streaming: false }];
                }
                if (finalContent) {
                  return [...prev, {
                    id: genId(),
                    role: 'assistant' as const,
                    content: finalContent,
                    streaming: false,
                    timestamp: Date.now(),
                  }];
                }
                return prev;
              });
            }
          }

          if (evt.type === 'tool_use') {
            const label = formatToolLabel(evt.data.name, evt.data.input);
            setMessages((prev) => [
              ...prev,
              {
                id: `tool-${evt.data.id}`,
                role: 'tool',
                content: label,
                toolName: evt.data.name,
                toolInput: evt.data.input,
                toolStatus: 'running',
                timestamp: Date.now(),
              },
            ]);
          }

          if (evt.type === 'tool_result') {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === `tool-${evt.data.id}`
                  ? {
                      ...m,
                      toolStatus: evt.data.isError ? 'error' : 'done',
                      toolResult: evt.data.content || '',
                    }
                  : m
              )
            );
          }

          if (evt.type === 'error') {
            setMessages((prev) => [
              ...prev,
              {
                id: genId(),
                role: 'system',
                content: evt.data.message,
                timestamp: Date.now(),
              },
            ]);
          }
          break;
        }

        case 'error':
          setMessages((prev) => [
            ...prev,
            {
              id: genId(),
              role: 'system',
              content: msg.data.message,
              timestamp: Date.now(),
            },
          ]);
          if (currentSessionRef.current) {
            setSessionActivity(prev => {
              const sid = currentSessionRef.current!.id;
              return { ...prev, [sid]: { ...(prev[sid] || DEFAULT_ACTIVITY), isLoading: false, agentStatus: '' } };
            });
          }
          break;
      }
    };

    ws.onclose = () => {
      setIsConnected(false);
      if (reconnectAttemptRef.current >= MAX_RECONNECT_ATTEMPTS) {
        console.warn('[useChat] Max reconnect attempts reached. Giving up.');
        return;
      }
      const attempt = reconnectAttemptRef.current++;
      const delay = Math.min(RECONNECT_BASE_MS * Math.pow(2, attempt), RECONNECT_MAX_MS);
      setTimeout(connect, delay);
    };

    ws.onerror = () => {
      ws.close();
    };
  }, []);

  const disconnect = useCallback(() => {
    wsRef.current?.close();
    wsRef.current = null;
  }, []);

  const sendMessage = useCallback((content: string) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
    // Require a workspace when no session exists yet — prevents orphaned sessions
    if (!currentSessionRef.current && !currentWorkspaceRef.current) return;

    const userMsg: ChatMessage = {
      id: genId(),
      role: 'user',
      content,
      timestamp: Date.now(),
    };
    setMessages((prev) => [...prev, userMsg]);
    streamBufferRef.current = '';

    if (currentSessionRef.current) {
      const sid = currentSessionRef.current.id;
      setSessionActivity(prev => ({
        ...prev,
        [sid]: { ...(prev[sid] || DEFAULT_ACTIVITY), isLoading: true, agentStatus: 'Thinking…' },
      }));
    }

    wsRef.current.send(JSON.stringify({
      type: 'message',
      content,
      workspaceName: currentWorkspaceRef.current ?? undefined,
    }));
  }, []);

  const joinSession = useCallback((sessionId: string) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
    setMessages([]);
    wsRef.current.send(JSON.stringify({ type: 'join_session', sessionId }));
  }, []);

  const newSession = useCallback((workspaceName?: string) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
    setMessages([]);
    wsRef.current.send(JSON.stringify({ type: 'new_session', workspaceName }));
  }, []);

  const deleteSession = useCallback((sessionId: string) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
    wsRef.current.send(JSON.stringify({ type: 'delete_session', sessionId }));
  }, []);

  useEffect(() => {
    return () => disconnect();
  }, [disconnect]);

  const currentActivity = currentSession
    ? (sessionActivity[currentSession.id] ?? DEFAULT_ACTIVITY)
    : DEFAULT_ACTIVITY;

  return {
    messages,
    sessions,
    currentSession,
    isConnected,
    isLoading: currentActivity.isLoading,
    agentStatus: currentActivity.agentStatus,
    sessionActivity,
    sessionCosts,
    workspaces,
    currentWorkspace,
    setCurrentWorkspace,
    fetchWorkspaces,
    connect,
    disconnect,
    sendMessage,
    joinSession,
    newSession,
    deleteSession,
  };
}
