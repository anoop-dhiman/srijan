import { useState, useCallback, useRef, useEffect } from 'react';
import { createChatSocket } from '../lib/api';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  streaming?: boolean;
  timestamp: number;
}

export interface Session {
  id: string;
  title: string;
  status: string;
  createdAt: string;
}

export function useChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [currentSession, setCurrentSession] = useState<Session | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
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
          const restored: ChatMessage[] = msg.data.events
            .filter((e: any) => e.type === 'user_message' || (e.type === 'agent_response' && !e.data?.streaming))
            .map((e: any, i: number) => ({
              id: `restored-${i}`,
              role: e.type === 'user_message' ? 'user' : 'assistant',
              content: e.type === 'user_message' ? e.data.content : e.data.content,
              timestamp: new Date(e.created_at).getTime(),
            }));
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
              setIsLoading(false);
            }
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
    streamBufferRef.current = '';

    wsRef.current.send(JSON.stringify({ type: 'message', content }));
  }, []);

  const joinSession = useCallback((sessionId: string) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
    setMessages([]);
    wsRef.current.send(JSON.stringify({ type: 'join_session', sessionId }));
  }, []);

  const newSession = useCallback(() => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
    setMessages([]);
    wsRef.current.send(JSON.stringify({ type: 'new_session' }));
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
    connect,
    disconnect,
    sendMessage,
    joinSession,
    newSession,
    deleteSession,
  };
}
