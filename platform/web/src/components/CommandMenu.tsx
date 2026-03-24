import { useEffect, useRef } from 'react';
import type { SlashCommand } from '../hooks/useSlashCommands';

interface CommandMenuProps {
  commands: SlashCommand[];
  selectedIndex: number;
  onSelect: (cmd: SlashCommand) => void;
  onClose: () => void;
}

export function CommandMenu({ commands, selectedIndex, onSelect, onClose }: CommandMenuProps) {
  const listRef = useRef<HTMLUListElement>(null);

  // Scroll selected item into view
  useEffect(() => {
    const el = listRef.current?.children[selectedIndex] as HTMLElement | undefined;
    el?.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex]);

  // Close on click outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (!listRef.current?.closest('[data-command-menu]')?.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  if (commands.length === 0) return null;

  return (
    <div
      data-command-menu
      className="absolute bottom-full left-0 z-50 mb-1 w-72 overflow-hidden rounded-lg border border-gray-200 bg-white shadow-lg"
    >
      <ul ref={listRef} role="listbox" aria-label="Slash commands">
        {commands.map((cmd, i) => (
          <li
            key={cmd.name}
            role="option"
            aria-selected={i === selectedIndex}
            onMouseDown={(e) => {
              e.preventDefault(); // prevent textarea blur
              onSelect(cmd);
            }}
            className={`flex cursor-pointer items-center gap-3 px-3 py-2 text-sm transition-colors ${
              i === selectedIndex
                ? 'bg-blue-50 text-blue-700'
                : 'text-gray-700 hover:bg-gray-50'
            }`}
          >
            <span
              className={`shrink-0 font-mono text-xs font-semibold ${
                i === selectedIndex ? 'text-blue-600' : 'text-gray-500'
              }`}
            >
              /{cmd.name}
            </span>
            <span className="truncate text-xs text-gray-500">{cmd.description}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
