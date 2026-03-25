import { useState, useCallback, useEffect } from 'react';
import { apiFetch } from '../lib/api';

export interface SlashCommand {
  name: string;
  description: string;
  type: 'builtin' | 'workspace';
  action: (context: SlashCommandContext) => void;
}

export interface SlashCommandContext {
  clearMessages: () => void;
  sendMessage: (content: string) => void;
  newSession: (workspace?: string) => void;
  setInput: (val: string) => void;
}

const BUILTIN_COMMANDS: SlashCommand[] = [
  {
    name: 'clear',
    description: 'Clear all messages in the current session',
    type: 'builtin',
    action: (ctx) => {
      ctx.clearMessages();
      ctx.setInput('');
    },
  },
  {
    name: 'compact',
    description: 'Summarize and compact the conversation',
    type: 'builtin',
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
    type: 'builtin',
    action: (ctx) => {
      ctx.newSession();
      ctx.setInput('');
    },
  },
  {
    name: 'help',
    description: 'Show available commands',
    type: 'builtin',
    action: (ctx) => {
      ctx.sendMessage('/help');
      ctx.setInput('');
    },
  },
];

interface WorkspaceCommandDef {
  name: string;
  description: string;
  content: string;
  hasArguments: boolean;
}

function buildWorkspaceCommand(def: WorkspaceCommandDef): SlashCommand {
  return {
    name: def.name,
    description: def.description,
    type: 'workspace',
    action: (ctx) => {
      if (def.hasArguments) {
        // Let user type arguments after the command name
        ctx.setInput(`/${def.name} `);
      } else {
        ctx.sendMessage(def.content);
        ctx.setInput('');
      }
    },
  };
}

export function useSlashCommands(context: SlashCommandContext, workspaceName: string | null) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [workspaceDefs, setWorkspaceDefs] = useState<WorkspaceCommandDef[]>([]);

  // Fetch workspace commands whenever the workspace changes
  useEffect(() => {
    if (!workspaceName) return;
    let cancelled = false;
    apiFetch(`/workspaces/${workspaceName}/commands`)
      .then((data) => { if (!cancelled) setWorkspaceDefs(data.commands ?? []); })
      .catch(() => { if (!cancelled) setWorkspaceDefs([]); });
    return () => { cancelled = true; };
  }, [workspaceName]);

  const allCommands: SlashCommand[] = [
    ...BUILTIN_COMMANDS,
    // Only include workspace commands when a workspace is active
    ...(workspaceName ? workspaceDefs.map((def) => buildWorkspaceCommand(def)) : []),
  ];

  const filteredCommands = query
    ? allCommands.filter((cmd) => cmd.name.toLowerCase().includes(query.toLowerCase()))
    : allCommands;

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
   * If the raw input matches a workspace command with $ARGUMENTS, substitute
   * the template and return the processed content. Otherwise return as-is.
   * Call this before sending a message.
   */
  const processInput = useCallback(
    (rawInput: string): string => {
      if (!rawInput.startsWith('/')) return rawInput;
      const [token, ...rest] = rawInput.trim().split(/\s+/);
      const commandName = token.slice(1);
      const def = workspaceDefs.find((d) => d.name === commandName);
      if (!def || !def.hasArguments) return rawInput;
      const args = rest.join(' ');
      return def.content.replace(/\$ARGUMENTS/g, args);
    },
    [workspaceDefs]
  );

  /**
   * Call this from the textarea's onChange handler with the current input value
   * to keep menu state in sync.
   */
  const handleInputChange = useCallback(
    (value: string) => {
      if (value.startsWith('/')) {
        // Only show menu when there's no space yet (still typing command name)
        const hasSpace = value.includes(' ');
        if (!hasSpace) {
          openMenu(value.slice(1));
        } else {
          closeMenu();
        }
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
    processInput,
  };
}
