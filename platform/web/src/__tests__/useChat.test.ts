/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

// ── WebSocket mock ───────────────────────────────────────────────────────────
const wsInstances: MockWebSocket[] = [];

class MockWebSocket {
  url: string;
  readyState: number = 0; // CONNECTING
  onopen: ((e: any) => void) | null = null;
  onmessage: ((e: any) => void) | null = null;
  onclose: ((e: any) => void) | null = null;
  onerror: ((e: any) => void) | null = null;
  send = vi.fn();
  close = vi.fn().mockImplementation(() => {
    this.readyState = 3; // CLOSED
    this.onclose?.({});
  });

  constructor(url: string) {
    this.url = url;
    wsInstances.push(this);
  }

  /** Helper: simulate successful connection */
  triggerOpen() {
    this.readyState = 1; // OPEN
    this.onopen?.({});
  }

  /** Helper: deliver a server message */
  triggerMessage(data: object) {
    this.onmessage?.({ data: JSON.stringify(data) });
  }

  /** Helper: simulate disconnect */
  triggerClose() {
    this.readyState = 3;
    this.onclose?.({});
  }
}

vi.stubGlobal('WebSocket', MockWebSocket);
vi.stubGlobal('WebSocket', Object.assign(MockWebSocket, {
  OPEN: 1,
  CONNECTING: 0,
  CLOSING: 2,
  CLOSED: 3,
}));

// ── API mocks ────────────────────────────────────────────────────────────────
vi.mock('../lib/api', () => ({
  createChatSocket: vi.fn(() => new MockWebSocket('ws://localhost/api/chat?token=test')),
  apiFetch: vi.fn().mockResolvedValue([]),
}));

import { apiFetch, createChatSocket } from '../lib/api';
import { useChat } from '../hooks/useChat';

// ── Helpers ──────────────────────────────────────────────────────────────────
function latestWs(): MockWebSocket {
  return wsInstances[wsInstances.length - 1];
}

describe('useChat hook', () => {
  beforeEach(() => {
    wsInstances.length = 0;
    vi.mocked(apiFetch).mockResolvedValue([]);
    vi.mocked(createChatSocket).mockImplementation(
      () => new MockWebSocket('ws://localhost/api/chat?token=test') as any
    );
    localStorage.clear();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // ── Initial state ──────────────────────────────────────────────────────────
  describe('initial state', () => {
    it('starts with empty messages', () => {
      const { result } = renderHook(() => useChat());
      expect(result.current.messages).toEqual([]);
    });

    it('starts with empty sessions', () => {
      const { result } = renderHook(() => useChat());
      expect(result.current.sessions).toEqual([]);
    });

    it('starts disconnected', () => {
      const { result } = renderHook(() => useChat());
      expect(result.current.isConnected).toBe(false);
    });

    it('starts not loading', () => {
      const { result } = renderHook(() => useChat());
      expect(result.current.isLoading).toBe(false);
    });

    it('starts with no current session', () => {
      const { result } = renderHook(() => useChat());
      expect(result.current.currentSession).toBeNull();
    });

    it('reads currentWorkspace from localStorage', () => {
      localStorage.setItem('srijan_workspace', 'my-ws');
      const { result } = renderHook(() => useChat());
      expect(result.current.currentWorkspace).toBe('my-ws');
    });
  });

  // ── connect / disconnect ───────────────────────────────────────────────────
  describe('connect', () => {
    it('creates a WebSocket and sets isConnected on open', async () => {
      const { result } = renderHook(() => useChat());

      await act(async () => {
        result.current.connect();
        latestWs().triggerOpen();
      });

      expect(result.current.isConnected).toBe(true);
    });

    it('sends list_sessions on open', async () => {
      const { result } = renderHook(() => useChat());

      await act(async () => {
        result.current.connect();
        latestWs().triggerOpen();
      });

      const calls = latestWs().send.mock.calls.map((c: any[]) => JSON.parse(c[0]));
      expect(calls.some(c => c.type === 'list_sessions')).toBe(true);
    });

    it('calls fetchWorkspaces (apiFetch /workspaces) on open', async () => {
      const { result } = renderHook(() => useChat());

      await act(async () => {
        result.current.connect();
        latestWs().triggerOpen();
        // allow promises to settle
        await Promise.resolve();
      });

      expect(apiFetch).toHaveBeenCalledWith('/workspaces');
    });

    it('does not create a second WS if already open', async () => {
      const { result } = renderHook(() => useChat());

      await act(async () => {
        result.current.connect();
        latestWs().triggerOpen();
      });

      const countBefore = wsInstances.length;
      await act(async () => { result.current.connect(); });
      expect(wsInstances.length).toBe(countBefore);
    });

    it('sets isConnected=false on close', async () => {
      const { result, unmount } = renderHook(() => useChat());

      await act(async () => {
        result.current.connect();
        latestWs().triggerOpen();
      });

      expect(result.current.isConnected).toBe(true);

      // Prevent reconnect loop on unmount
      unmount();
    });
  });

  // ── WebSocket messages ─────────────────────────────────────────────────────
  describe('sessions message', () => {
    it('updates sessions list', async () => {
      const { result } = renderHook(() => useChat());

      await act(async () => {
        result.current.connect();
        latestWs().triggerOpen();
        latestWs().triggerMessage({
          type: 'sessions',
          data: [{ id: 's1', title: 'Session 1', status: 'active', workspaceName: 'ws', createdAt: '' }],
        });
        await Promise.resolve();
      });

      expect(result.current.sessions).toHaveLength(1);
      expect(result.current.sessions[0].id).toBe('s1');
    });

    it('fetches cost for each session', async () => {
      vi.mocked(apiFetch).mockImplementation(async (path: string) => {
        if (path === '/workspaces') return [];
        if (path.includes('/cost')) return { cost_usd: 0.05 };
        return [];
      });

      const { result } = renderHook(() => useChat());

      await act(async () => {
        result.current.connect();
        latestWs().triggerOpen();
        latestWs().triggerMessage({
          type: 'sessions',
          data: [{ id: 's1', title: 'Sess', status: 'active', workspaceName: 'ws', createdAt: '' }],
        });
        await Promise.resolve();
      });

      expect(apiFetch).toHaveBeenCalledWith('/sessions/s1/cost');
    });

    it('auto-rejoins saved session on receiving sessions list', async () => {
      localStorage.setItem('srijan_session_id', 's1');
      const { result } = renderHook(() => useChat());

      await act(async () => {
        result.current.connect();
        latestWs().triggerOpen();
        latestWs().triggerMessage({
          type: 'sessions',
          data: [{ id: 's1', title: 'Sess', status: 'active', workspaceName: 'ws', createdAt: '' }],
        });
      });

      const calls = latestWs().send.mock.calls.map((c: any[]) => JSON.parse(c[0]));
      expect(calls.some(c => c.type === 'join_session' && c.sessionId === 's1')).toBe(true);
    });
  });

  describe('session_created message', () => {
    it('sets current session and prepends to sessions list', async () => {
      const { result } = renderHook(() => useChat());
      const newSession = { id: 'new-s', title: 'New', status: 'active', workspaceName: 'ws', createdAt: '' };

      await act(async () => {
        result.current.connect();
        latestWs().triggerOpen();
        latestWs().triggerMessage({ type: 'session_created', data: newSession });
      });

      expect(result.current.currentSession?.id).toBe('new-s');
      expect(result.current.sessions[0].id).toBe('new-s');
    });

    it('persists session id to localStorage', async () => {
      const { result } = renderHook(() => useChat());

      await act(async () => {
        result.current.connect();
        latestWs().triggerOpen();
        latestWs().triggerMessage({
          type: 'session_created',
          data: { id: 'abc', title: 'T', status: 'active', workspaceName: null, createdAt: '' },
        });
      });

      expect(localStorage.getItem('srijan_session_id')).toBe('abc');
    });
  });

  describe('session_deleted message', () => {
    it('removes session from list', async () => {
      const { result } = renderHook(() => useChat());

      await act(async () => {
        result.current.connect();
        latestWs().triggerOpen();
        latestWs().triggerMessage({
          type: 'sessions',
          data: [{ id: 's1', title: 'S', status: 'active', workspaceName: 'ws', createdAt: '' }],
        });
        await Promise.resolve();
      });

      await act(async () => {
        latestWs().triggerMessage({ type: 'session_deleted', data: { sessionId: 's1' } });
      });

      expect(result.current.sessions.find(s => s.id === 's1')).toBeUndefined();
    });

    it('clears current session and messages if active session is deleted', async () => {
      const { result } = renderHook(() => useChat());

      await act(async () => {
        result.current.connect();
        latestWs().triggerOpen();
        latestWs().triggerMessage({
          type: 'session_created',
          data: { id: 's1', title: 'S', status: 'active', workspaceName: 'ws', createdAt: '' },
        });
      });

      await act(async () => {
        latestWs().triggerMessage({ type: 'session_deleted', data: { sessionId: 's1' } });
      });

      expect(result.current.currentSession).toBeNull();
      expect(result.current.messages).toEqual([]);
    });
  });

  describe('agent_event messages', () => {
    async function setup() {
      const { result } = renderHook(() => useChat());
      const session = { id: 'sess', title: 'S', status: 'active', workspaceName: 'ws', createdAt: '' };

      await act(async () => {
        result.current.connect();
        latestWs().triggerOpen();
        latestWs().triggerMessage({ type: 'session_created', data: session });
      });

      return result;
    }

    it('agent_response with done=true appends assistant message', async () => {
      const result = await setup();

      await act(async () => {
        latestWs().triggerMessage({
          type: 'agent_event',
          data: { sessionId: 'sess', type: 'agent_response', data: { content: 'Hello!', done: true } },
        });
      });

      const msg = result.current.messages.find(m => m.role === 'assistant');
      expect(msg).toBeDefined();
      expect(msg!.content).toBe('Hello!');
    });

    it('agent_response streaming=true creates streaming message', async () => {
      const result = await setup();

      await act(async () => {
        latestWs().triggerMessage({
          type: 'agent_event',
          data: { sessionId: 'sess', type: 'agent_response', data: { content: 'Hel', streaming: true } },
        });
      });

      const msg = result.current.messages.find(m => m.streaming);
      expect(msg).toBeDefined();
    });

    it('tool_use event adds a tool message', async () => {
      const result = await setup();

      await act(async () => {
        latestWs().triggerMessage({
          type: 'agent_event',
          data: {
            sessionId: 'sess',
            type: 'tool_use',
            data: { id: 'tool-1', name: 'Bash', input: { command: 'ls' } },
          },
        });
      });

      const msg = result.current.messages.find(m => m.role === 'tool');
      expect(msg).toBeDefined();
      expect(msg!.toolName).toBe('Bash');
      expect(msg!.toolStatus).toBe('running');
    });

    it('tool_result updates tool message status to done', async () => {
      const result = await setup();

      await act(async () => {
        latestWs().triggerMessage({
          type: 'agent_event',
          data: { sessionId: 'sess', type: 'tool_use', data: { id: 'tool-1', name: 'Bash', input: { command: 'ls' } } },
        });
        latestWs().triggerMessage({
          type: 'agent_event',
          data: { sessionId: 'sess', type: 'tool_result', data: { id: 'tool-1', content: 'file.txt', isError: false } },
        });
      });

      const msg = result.current.messages.find(m => m.id === 'tool-tool-1');
      expect(msg?.toolStatus).toBe('done');
      expect(msg?.toolResult).toBe('file.txt');
    });

    it('error event appends system message', async () => {
      const result = await setup();

      await act(async () => {
        latestWs().triggerMessage({
          type: 'agent_event',
          data: { sessionId: 'sess', type: 'error', data: { message: 'Something went wrong' } },
        });
      });

      const msg = result.current.messages.find(m => m.role === 'system');
      expect(msg?.content).toBe('Something went wrong');
    });

    it('session_start sets isLoading=true', async () => {
      const result = await setup();

      await act(async () => {
        latestWs().triggerMessage({
          type: 'agent_event',
          data: { sessionId: 'sess', type: 'session_start', data: {} },
        });
      });

      expect(result.current.isLoading).toBe(true);
    });

    it('agent_response done clears isLoading', async () => {
      const result = await setup();

      await act(async () => {
        latestWs().triggerMessage({
          type: 'agent_event',
          data: { sessionId: 'sess', type: 'session_start', data: {} },
        });
        latestWs().triggerMessage({
          type: 'agent_event',
          data: { sessionId: 'sess', type: 'agent_response', data: { content: 'done', done: true } },
        });
      });

      expect(result.current.isLoading).toBe(false);
    });
  });

  // ── sendMessage ────────────────────────────────────────────────────────────
  describe('sendMessage', () => {
    it('appends user message to messages list', async () => {
      const { result } = renderHook(() => useChat());

      await act(async () => {
        result.current.connect();
        latestWs().triggerOpen();
        latestWs().triggerMessage({
          type: 'session_created',
          data: { id: 's1', title: 'T', status: 'active', workspaceName: 'ws', createdAt: '' },
        });
      });

      await act(async () => {
        result.current.sendMessage('hello world');
      });

      expect(result.current.messages.some(m => m.role === 'user' && m.content === 'hello world')).toBe(true);
    });

    it('sends WS message of type "message"', async () => {
      const { result } = renderHook(() => useChat());

      await act(async () => {
        result.current.connect();
        latestWs().triggerOpen();
        latestWs().triggerMessage({
          type: 'session_created',
          data: { id: 's1', title: 'T', status: 'active', workspaceName: 'ws', createdAt: '' },
        });
      });

      latestWs().send.mockClear();

      await act(async () => { result.current.sendMessage('test message'); });

      const calls = latestWs().send.mock.calls.map((c: any[]) => JSON.parse(c[0]));
      expect(calls.some(c => c.type === 'message' && c.content === 'test message')).toBe(true);
    });

    it('does nothing when WS is not open', async () => {
      const { result } = renderHook(() => useChat());
      // Don't connect
      await act(async () => { result.current.sendMessage('ignored'); });
      expect(result.current.messages).toEqual([]);
    });
  });

  // ── setCurrentWorkspace ────────────────────────────────────────────────────
  describe('setCurrentWorkspace', () => {
    it('updates currentWorkspace state', async () => {
      const { result } = renderHook(() => useChat());
      await act(async () => { result.current.setCurrentWorkspace('new-ws'); });
      expect(result.current.currentWorkspace).toBe('new-ws');
    });

    it('persists to localStorage', async () => {
      const { result } = renderHook(() => useChat());
      await act(async () => { result.current.setCurrentWorkspace('persist-ws'); });
      expect(localStorage.getItem('srijan_workspace')).toBe('persist-ws');
    });

    it('removes from localStorage when set to null', async () => {
      localStorage.setItem('srijan_workspace', 'old-ws');
      const { result } = renderHook(() => useChat());
      await act(async () => { result.current.setCurrentWorkspace(null); });
      expect(localStorage.getItem('srijan_workspace')).toBeNull();
    });
  });

  // ── fetchWorkspaces ────────────────────────────────────────────────────────
  describe('fetchWorkspaces', () => {
    it('calls apiFetch /workspaces and updates workspaces', async () => {
      vi.mocked(apiFetch).mockResolvedValueOnce([
        { name: 'ws1', sessionCount: 1, runningContainerCount: 0, totalCostUsd: null, lastActivityAt: null },
      ]);
      const { result } = renderHook(() => useChat());
      await act(async () => { await result.current.fetchWorkspaces(); });
      expect(result.current.workspaces).toHaveLength(1);
      expect(result.current.workspaces[0].name).toBe('ws1');
    });

    it('does not throw when apiFetch rejects', async () => {
      vi.mocked(apiFetch).mockRejectedValueOnce(new Error('Network error'));
      const { result } = renderHook(() => useChat());
      await expect(act(async () => { await result.current.fetchWorkspaces(); })).resolves.toBeUndefined();
    });
  });

  // ── session_joined ─────────────────────────────────────────────────────────
  describe('session_joined message', () => {
    it('sets currentSession and restores messages from events', async () => {
      const { result } = renderHook(() => useChat());
      const session = { id: 's1', title: 'Restored', status: 'active', workspaceName: 'ws', createdAt: '' };

      await act(async () => {
        result.current.connect();
        latestWs().triggerOpen();
        latestWs().triggerMessage({
          type: 'session_joined',
          data: {
            session,
            events: [
              { type: 'user_message', data: { content: 'Hi' }, created_at: new Date().toISOString() },
              { type: 'agent_response', data: { content: 'Hello', done: true }, created_at: new Date().toISOString() },
            ],
          },
        });
      });

      expect(result.current.currentSession?.id).toBe('s1');
      expect(result.current.messages.some(m => m.role === 'user' && m.content === 'Hi')).toBe(true);
      expect(result.current.messages.some(m => m.role === 'assistant' && m.content === 'Hello')).toBe(true);
    });
  });
});
