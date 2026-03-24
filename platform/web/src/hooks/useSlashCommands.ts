import { useState, useCallback } from 'react';

export interface SlashCommand {
  name: string;
  description: string;
  action: (context: SlashCommandContext) => void;
}

export interface SlashCommandContext {
  clearMessages: () => void;
  sendMessage: (content: string) => void;
  newSession: (workspace?: string) => void;
  setInput: (val: string) => void;
}

const COMMANDS: SlashCommand[] = [
  {
    name: 'clear',
    description: 'Clear all messages in the current session',
    action: (ctx) => {
      ctx.clearMessages();
      ctx.setInput('');
    },
  },
  {
    name: 'compact',
    description: 'Summarize and compact the conversation',
    action: (ctx) => {
      ctx.sendMessage(
        'Please summarize our conversation so far concisely, then continue from where we left off.'
      );
      ctx.setInput('');
    },
  },
  {
    name: 'new',
    description: 'Start a new session',
    action: (ctx) => {
      ctx.newSession();
      ctx.setInput('');
    },
  },
  {
    name: 'help',
    description: 'Show available commands',
    action: (ctx) => {
      ctx.sendMessage('/help');
      ctx.setInput('');
    },
  },
];

export function useSlashCommands(context: SlashCommandContext) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);

  const filteredCommands = query
    ? COMMANDS.filter((cmd) => cmd.name.toLowerCase().includes(query.toLowerCase()))
    : COMMANDS;

  const openMenu = useCallback((q: string) => {
    setQuery(q);
    setSelectedIndex(0);
    setMenuOpen(true);
  }, []);

  const closeMenu = useCallback(() => {
    setMenuOpen(false);
    setQuery('');
    setSelectedIndex(0);
  }, []);

  const selectCommand = useCallback(
    (cmd: SlashCommand) => {
      cmd.action(context);
      closeMenu();
    },
    [context, closeMenu]
  );

  /**
   * Call this from the textarea's onChange handler with the current input value
   * to keep menu state in sync.
   */
  const handleInputChange = useCallback(
    (value: string) => {
      if (value.startsWith('/')) {
        const q = value.slice(1);
        openMenu(q);
      } else {
        closeMenu();
      }
    },
    [openMenu, closeMenu]
  );

  /**
   * Call this from the textarea's onKeyDown handler.
   * Returns true if the event was handled (caller should call e.preventDefault()).
   */
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent): boolean => {
      if (!menuOpen) {
        if (e.key === '/' && (e.currentTarget as HTMLTextAreaElement).value === '') {
          openMenu('');
          return false; // let the '/' character be typed
        }
        return false;
      }

      if (e.key === 'ArrowDown') {
        setSelectedIndex((i) => (i + 1) % Math.max(filteredCommands.length, 1));
        return true;
      }
      if (e.key === 'ArrowUp') {
        setSelectedIndex((i) =>
          (i - 1 + Math.max(filteredCommands.length, 1)) % Math.max(filteredCommands.length, 1)
        );
        return true;
      }
      if (e.key === 'Enter' && filteredCommands.length > 0) {
        selectCommand(filteredCommands[selectedIndex] ?? filteredCommands[0]);
        return true;
      }
      if (e.key === 'Escape') {
        closeMenu();
        return true;
      }
      return false;
    },
    [menuOpen, filteredCommands, selectedIndex, selectCommand, closeMenu, openMenu]
  );

  return {
    menuOpen,
    filteredCommands,
    query,
    selectedIndex,
    handleKeyDown,
    handleInputChange,
    selectCommand,
    closeMenu,
  };
}
