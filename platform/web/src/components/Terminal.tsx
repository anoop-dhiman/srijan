import { useEffect, useRef } from 'react';
import { Terminal as XTerm } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import { getToken } from '../lib/api';

interface TerminalProps {
  sessionId: string | null;
}

export function Terminal({ sessionId }: TerminalProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<XTerm | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const fitRef = useRef<FitAddon | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const term = new XTerm({
      theme: {
        background: '#09090b',
        foreground: '#fafafa',
        cursor: '#fafafa',
      },
      fontFamily: 'ui-monospace, monospace',
      fontSize: 14,
      cursorBlink: true,
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.open(containerRef.current);
    fitAddon.fit();
    termRef.current = term;
    fitRef.current = fitAddon;

    // Connect WebSocket
    const token = getToken();
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;
    const wsUrl = `${protocol}//${host}/api/terminal?token=${token}${sessionId ? `&sessionId=${sessionId}` : ''}`;
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      term.write('\r\n\x1b[32m● Connected to terminal\x1b[0m\r\n\r\n');
    };

    ws.onmessage = (event) => {
      term.write(event.data);
    };

    ws.onclose = () => {
      term.write('\r\n\x1b[31m● Terminal disconnected\x1b[0m\r\n');
    };

    ws.onerror = () => {
      term.write('\r\n\x1b[31m● Connection error\x1b[0m\r\n');
    };

    term.onData((data) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'input', data }));
      }
    });

    // ResizeObserver to fit on container size change
    const ro = new ResizeObserver(() => {
      fitAddon.fit();
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'resize', cols: term.cols, rows: term.rows }));
      }
    });
    ro.observe(containerRef.current);

    return () => {
      ro.disconnect();
      ws.close();
      term.dispose();
    };
  }, [sessionId]);

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-[#09090b]">
      <div className="px-6 py-3 border-b border-border shrink-0">
        <h2 className="font-semibold text-sm text-muted-foreground">Terminal</h2>
      </div>
      <div ref={containerRef} className="flex-1 p-2 overflow-hidden" />
    </div>
  );
}
