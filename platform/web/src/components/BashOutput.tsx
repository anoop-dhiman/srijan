import { useEffect, useRef } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';

interface BashOutputProps {
  content: string;
}

export function BashOutput({ content }: BashOutputProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current || !content) return;

    const term = new Terminal({
      theme: {
        background: '#09090b',
        foreground: '#e4e4e7',
        cursor: '#09090b', // hidden — read-only display
        selectionBackground: '#3f3f46',
      },
      fontFamily: 'ui-monospace, monospace',
      fontSize: 12,
      cursorBlink: false,
      disableStdin: true,
      scrollback: 1000,
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.open(containerRef.current);
    fitAddon.fit();

    // Normalize line endings and write content
    const normalized = content.replace(/\r?\n/g, '\r\n');
    term.write(normalized);

    const ro = new ResizeObserver(() => fitAddon.fit());
    ro.observe(containerRef.current);

    return () => {
      ro.disconnect();
      term.dispose();
    };
  }, [content]);

  if (!content) return null;

  return (
    <div
      ref={containerRef}
      className="rounded-b-lg overflow-hidden"
      style={{ height: '180px', background: '#09090b' }}
    />
  );
}
