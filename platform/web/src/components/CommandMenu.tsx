import { useEffect, useRef } from 'react';
import { FolderOpen } from 'lucide-react';
import type { SlashCommand } from '../hooks/useSlashCommands';

interface CommandMenuProps {
  commands: SlashCommand[];
  selectedIndex: number;
  onSelect: (cmd: SlashCommand) => void;
  onClose: () => void;
}

export function CommandMenu({ commands, selectedIndex, onSelect, onClose }: CommandMenuProps) {
  const listRef = useRef<HTMLDivElement>(null);

  // Scroll selected item into view
  useEffect(() => {
    const items = listRef.current?.querySelectorAll('[role="option"]');
    (items?.[selectedIndex] as HTMLElement | undefined)?.scrollIntoView({ block: 'nearest' });
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

  const builtins = commands.filter((c) => c.type === 'builtin');
  const workspace = commands.filter((c) => c.type === 'workspace');

  // Track absolute index across sections for selectedIndex
  let absoluteIndex = 0;

  const renderItem = (cmd: SlashCommand) => {
    const idx = absoluteIndex++;
    const isSelected = idx === selectedIndex;
    return (
      <div
        key={cmd.name}
        role="option"
        aria-selected={isSelected}
        onMouseDown={(e) => {
          e.preventDefault();
          onSelect(cmd);
        }}
        className={`flex cursor-pointer items-center gap-3 px-3 py-2 transition-colors ${
          isSelected
            ? 'bg-primary/10 text-primary'
            : 'text-foreground hover:bg-muted'
        }`}
      >
        <span
          className={`shrink-0 font-mono text-xs font-semibold ${
            isSelected ? 'text-primary' : 'text-muted-foreground'
          }`}
        >
          /{cmd.name}
        </span>
        {cmd.type === 'workspace' && (
          <FolderOpen size={11} className="shrink-0 text-muted-foreground" />
        )}
        <span className="truncate text-xs text-muted-foreground">{cmd.description}</span>
      </div>
    );
  };

  return (
    <div
      data-command-menu
      className="absolute bottom-full left-0 z-50 mb-1 w-80 overflow-hidden rounded-lg border border-border bg-background shadow-lg max-h-72 overflow-y-auto"
    >
      <div ref={listRef} role="listbox" aria-label="Slash commands">
        {builtins.length > 0 && (
          <>
            <div className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60 border-b border-border/50">
              Built-in
            </div>
            {builtins.map(renderItem)}
          </>
        )}
        {workspace.length > 0 && (
          <>
            <div className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60 border-t border-b border-border/50 flex items-center gap-1.5">
              <FolderOpen size={10} />
              Workspace (.claude/commands)
            </div>
            {workspace.map(renderItem)}
          </>
        )}
      </div>
    </div>
  );
}
