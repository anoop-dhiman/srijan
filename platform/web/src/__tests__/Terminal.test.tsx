/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

// Mock xterm — not available in jsdom
vi.mock('@xterm/xterm', () => {
  class TerminalMock {
    cols = 80;
    rows = 24;
    loadAddon = vi.fn();
    open = vi.fn();
    write = vi.fn();
    onData = vi.fn();
    onExit = vi.fn();
    dispose = vi.fn();
  }
  return { Terminal: TerminalMock };
});

vi.mock('@xterm/addon-fit', () => {
  class FitAddonMock {
    fit = vi.fn();
  }
  return { FitAddon: FitAddonMock };
});

vi.mock('../lib/api', () => ({
  getToken: vi.fn().mockReturnValue('test-token'),
}));

// Track WS instances for assertions
const wsInstances: any[] = [];

class MockWebSocket {
  url: string;
  onopen: ((e: any) => void) | null = null;
  onmessage: ((e: any) => void) | null = null;
  onclose: ((e: any) => void) | null = null;
  onerror: ((e: any) => void) | null = null;
  readyState = 1;
  send = vi.fn();
  close = vi.fn();

  constructor(url: string) {
    this.url = url;
    wsInstances.push(this);
  }
}

class MockResizeObserver {
  observe = vi.fn();
  disconnect = vi.fn();
}

vi.stubGlobal('WebSocket', MockWebSocket);
vi.stubGlobal('ResizeObserver', MockResizeObserver);

import { Terminal } from '../components/Terminal';

describe('Terminal', () => {
  beforeEach(() => {
    wsInstances.length = 0;
    vi.clearAllMocks();
  });

  it('renders the Terminal heading', () => {
    render(<Terminal sessionId={null} />);
    expect(screen.getByText('Terminal')).toBeInTheDocument();
  });

  it('connects to WebSocket with correct URL when sessionId is provided', () => {
    render(<Terminal sessionId="my-session-123" />);

    expect(wsInstances.length).toBe(1);
    expect(wsInstances[0].url).toContain('/api/terminal');
    expect(wsInstances[0].url).toContain('token=test-token');
    expect(wsInstances[0].url).toContain('sessionId=my-session-123');
  });

  it('connects to WebSocket without sessionId when null', () => {
    render(<Terminal sessionId={null} />);

    expect(wsInstances.length).toBe(1);
    expect(wsInstances[0].url).not.toContain('sessionId=null');
    expect(wsInstances[0].url).not.toContain('sessionId=&');
  });

  it('closes WebSocket on unmount', () => {
    const { unmount } = render(<Terminal sessionId="session-1" />);
    expect(wsInstances.length).toBe(1);
    unmount();
    expect(wsInstances[0].close).toHaveBeenCalled();
  });
});
