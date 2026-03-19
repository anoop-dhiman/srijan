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

export function useChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [currentSession, setCurrentSession] = useState<Session | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [agentStatus, setAgentStatus] = useState('');
  const [sessionCosts, setSessionCosts] = useState<Record<string, number>>({});
  const wsRef = useRef<WebSocket | null>(null);
  const streamBufferRef = useRef('');

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    const ws = createChatSocket();
    wsRef.current = ws;

    ws.onopen = () => {
      setIsConnected(true);
      ws.send(JSON.stringify({ type: 'list_sessions' }));
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

        case 'session_joined':
          setCurrentSession(msg.data.session);
          localStorage.setItem('srijan_session_id', msg.data.session.id);
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
              // Attach result to the preceding tool_use message
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

          if (evt.type === 'session_start') {
            setAgentStatus('Connecting to agent…');
          }

          if (evt.type === 'agent_response') {
            if (evt.data.streaming) {
              setAgentStatus('Writing…');
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
                    id: `msg-${Date.now()}`,
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
                    id: `msg-${Date.now()}`,
                    role: 'assistant' as const,
                    content: finalContent,
                    streaming: false,
                    timestamp: Date.now(),
                  }];
                }
                return prev;
              });
              setAgentStatus('');
              setIsLoading(false);
            }
          }

          if (evt.type === 'tool_use') {
            const label = formatToolLabel(evt.data.name, evt.data.input);
            setAgentStatus(label);
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
            setAgentStatus('Thinking…');
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
                id: `err-${Date.now()}`,
                role: 'system',
                content: evt.data.message,
                timestamp: Date.now(),
              },
            ]);
            setAgentStatus('');
            setIsLoading(false);
          }
          break;
        }

        case 'error':
          setMessages((prev) => [
            ...prev,
            {
              id: `err-${Date.now()}`,
              role: 'system',
              content: msg.data.message,
              timestamp: Date.now(),
            },
          ]);
          setAgentStatus('');
          setIsLoading(false);
          break;
      }
    };

    ws.onclose = () => {
      setIsConnected(false);
      // Reconnect after 3s
      setTimeout(connect, 3000);
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

    const userMsg: ChatMessage = {
      id: `msg-${Date.now()}`,
      role: 'user',
      content,
      timestamp: Date.now(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setIsLoading(true);
    setAgentStatus('Thinking…');
    streamBufferRef.current = '';

    wsRef.current.send(JSON.stringify({ type: 'message', content }));
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

  return {
    messages,
    sessions,
    currentSession,
    isConnected,
    isLoading,
    agentStatus,
    sessionCosts,
    connect,
    disconnect,
    sendMessage,
    joinSession,
    newSession,
    deleteSession,
  };
}
