import { useState, useRef, useEffect, useCallback } from 'react';
import type { FormEvent } from 'react';
import {
  Send, Plus, Menu, Loader2, Trash2, PlayCircle, Square,
  PanelLeftClose, PanelLeftOpen, CheckCircle2, XCircle, Terminal,
  FileText, Search, FolderSearch, Bot, ChevronDown, ChevronRight, AlertTriangle, Circle,
} from 'lucide-react';
import type { ChatMessage, Session, WorkspaceInfo, SessionActivity } from '../hooks/useChat';
import ReactMarkdown from 'react-markdown';
import rehypeSanitize from 'rehype-sanitize';
import { apiFetch } from '../lib/api';
import { BashOutput } from './BashOutput';
import { PlanCard } from './PlanCard';
import { AgentSidebar, type SessionAgent, getAgentColor } from './AgentSidebar';
import { TokenPie } from './TokenPie';
import { PermissionBanner } from './PermissionBanner';
import { ThinkingModeSelector } from './ThinkingModeSelector';
import { THINKING_BUDGETS } from './thinkingModes';
import type { ThinkingMode } from './thinkingModes';
import { CommandMenu } from './CommandMenu';
import { useSlashCommands } from '../hooks/useSlashCommands';
import { useFileMentions } from '../hooks/useFileMentions';
import { FileMentionDropdown } from './FileMentionDropdown';

interface ChatProps {
  messages: ChatMessage[];
  sessions: Session[];
  currentSession: Session | null;
  isLoading: boolean;
  agentStatus: string;
  sessionActivity: Record<string, SessionActivity>;
  sessionCosts: Record<string, number>;
  sessionTokens?: Record<string, { inputTokens: number; outputTokens: number }>;
  currentWorkspace: string | null;
  workspaces: WorkspaceInfo[];
  onSendMessage: (content: string, thinkingBudget?: number) => void;
  onNewSession: (workspaceName: string) => void;
  onJoinSession: (sessionId: string) => void;
  onDeleteSession: (sessionId: string) => void;
  onWorkspaceChange: (name: string) => void;
  onReplaySession: (sessionId: string) => void;
  onGoToDashboard: () => void;
  onAbortSession: () => void;
  activeRole?: { name: string; displayName: string } | null;
  agents?: SessionAgent[];
  onCreateAgent?: (name: string, displayName: string, roleId?: string, subdir?: string) => void;
}

const MIN_WIDTH = 180;
const MAX_WIDTH = 480;
const DEFAULT_WIDTH = 240;

function toolIcon(name: string) {
  switch (name) {
    case 'Bash': return <Terminal size={14} />;
    case 'Read': case 'Write': case 'Edit': return <FileText size={14} />;
    case 'Grep': return <Search size={14} />;
    case 'Glob': return <FolderSearch size={14} />;
    case 'Agent': return <Bot size={14} />;
    default: return <Terminal size={14} />;
  }
}

function ToolMessage({ msg }: { msg: ChatMessage }) {
  const [expanded, setExpanded] = useState(false);
  const isRunning = msg.toolStatus === 'running';
  const isError = msg.toolStatus === 'error';
  const hasDetails = msg.toolInput || msg.toolResult;

  return (
    <div className="flex flex-col items-start gap-1">
      <button
        onClick={() => hasDetails && setExpanded(!expanded)}
        className={`flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-mono transition-colors ${
          isRunning
            ? 'bg-primary/10 text-primary border border-primary/20'
            : isError
            ? 'bg-destructive/10 text-destructive border border-destructive/20'
            : 'bg-muted/50 text-muted-foreground border border-border/50 hover:bg-muted'
        } ${hasDetails ? 'cursor-pointer' : 'cursor-default'}`}
      >
        {isRunning ? (
          <Loader2 size={14} className="animate-spin shrink-0" />
        ) : isError ? (
          <XCircle size={14} className="shrink-0" />
        ) : (
          <>
            {toolIcon(msg.toolName || '')}
            <CheckCircle2 size={14} className="text-green-500 shrink-0" />
          </>
        )}
        <span className="truncate max-w-[60vw] sm:max-w-md">{msg.content}</span>
        {hasDetails && (expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />)}
      </button>

      {expanded && hasDetails && (
        <div className="ml-2 max-w-[calc(100%-0.5rem)] sm:max-w-2xl rounded-lg border border-border/50 bg-background text-xs font-mono overflow-hidden">
          {msg.toolInput && (
            <div className="px-3 py-2 border-b border-border/30">
              <div className="text-muted-foreground mb-1 text-[10px] uppercase tracking-wider">Input</div>
              <pre className="whitespace-pre-wrap break-all text-foreground/80 max-h-40 overflow-y-auto">
                {typeof msg.toolInput === 'string' ? msg.toolInput : JSON.stringify(msg.toolInput, null, 2)}
              </pre>
            </div>
          )}
          {msg.toolResult && (
            msg.toolName === 'Bash' ? (
              <div>
                <div className={`px-3 py-1.5 text-[10px] uppercase tracking-wider border-t border-border/30 ${isError ? 'text-destructive' : 'text-muted-foreground'}`}>
                  {isError ? 'Error' : 'Output'}
                </div>
                <BashOutput content={msg.toolResult} />
              </div>
            ) : (
              <div className="px-3 py-2">
                <div className={`mb-1 text-[10px] uppercase tracking-wider ${isError ? 'text-destructive' : 'text-muted-foreground'}`}>
                  {isError ? 'Error' : 'Output'}
                </div>
                <pre className="whitespace-pre-wrap break-all text-foreground/80 max-h-60 overflow-y-auto">
                  {msg.toolResult}
                </pre>
              </div>
            )
          )}
        </div>
      )}
    </div>
  );
}

function ThinkingIndicator({ status }: { status: string }) {
  return (
    <div className="flex justify-start">
      <div className="flex items-center gap-2.5 rounded-2xl bg-muted border border-border px-4 py-3">
        <div className="flex gap-1">
          <span className="w-2 h-2 bg-primary/60 rounded-full animate-bounce [animation-delay:0ms]" />
          <span className="w-2 h-2 bg-primary/60 rounded-full animate-bounce [animation-delay:150ms]" />
          <span className="w-2 h-2 bg-primary/60 rounded-full animate-bounce [animation-delay:300ms]" />
        </div>
        <span className="text-sm text-muted-foreground">{status}</span>
      </div>
    </div>
  );
}

function WorkspaceSwitcher({
  currentWorkspace,
  workspaces,
  onSelect,
  onGoToDashboard,
}: {
  currentWorkspace: string | null;
  workspaces: WorkspaceInfo[];
  onSelect: (name: string) => void;
  onGoToDashboard: () => void;
}) {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  return (
    <div className="space-y-1.5">
      <p className="px-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/70">
        Workspace
      </p>

      <div ref={dropdownRef} className="relative">
        <button
          onClick={() => setDropdownOpen(!dropdownOpen)}
          className="w-full flex items-center justify-between gap-1.5 px-2.5 py-2 rounded-lg bg-background border border-border text-sm font-medium hover:bg-muted transition-colors"
        >
          <span className="truncate font-mono text-xs">
            {currentWorkspace || <span className="text-muted-foreground font-sans font-normal">Select…</span>}
          </span>
          <ChevronDown size={13} className={`shrink-0 text-muted-foreground transition-transform ${dropdownOpen ? 'rotate-180' : ''}`} />
        </button>

        {dropdownOpen && (
          <div className="absolute left-0 right-0 top-full mt-1 z-50 rounded-xl border border-border bg-background shadow-lg overflow-hidden">
            {workspaces.length === 0 ? (
              <p className="px-3 py-2.5 text-xs text-muted-foreground">No workspaces yet.</p>
            ) : (
              <div className="py-1 max-h-48 overflow-y-auto">
                {workspaces.map((ws) => (
                  <button
                    key={ws.name}
                    onClick={() => { onSelect(ws.name); setDropdownOpen(false); }}
                    className={`w-full text-left px-3 py-2 text-xs hover:bg-muted transition-colors flex items-center justify-between gap-2 ${
                      ws.name === currentWorkspace ? 'text-primary font-semibold' : 'text-foreground font-mono'
                    }`}
                  >
                    <span className="truncate">{ws.name}</span>
                    {ws.name === currentWorkspace && <CheckCircle2 size={12} className="shrink-0 text-primary" />}
                  </button>
                ))}
              </div>
            )}
            <div className="border-t border-border">
              <button
                onClick={() => { setDropdownOpen(false); onGoToDashboard(); }}
                className="w-full text-left px-3 py-2 text-xs text-muted-foreground hover:text-foreground hover:bg-muted transition-colors flex items-center gap-1.5"
              >
                <Plus size={11} />
                Create workspace in Dashboard
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export function Chat({
  messages,
  sessions,
  currentSession,
  isLoading,
  agentStatus,
  sessionActivity,
  sessionCosts,
  sessionTokens,
  currentWorkspace,
  workspaces,
  onSendMessage,
  onNewSession,
  onJoinSession,
  onDeleteSession,
  onWorkspaceChange,
  onReplaySession,
  onGoToDashboard,
  onAbortSession,
  activeRole,
  agents,
  onCreateAgent,
}: ChatProps) {
  const [input, setInput] = useState('');
  const [thinkingMode, setThinkingMode] = useState<ThinkingMode>('none');
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(DEFAULT_WIDTH);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const isAtBottom = useRef(true);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const isResizing = useRef(false);
  const [spendingWarning, setSpendingWarning] = useState<{ percent: number; limit_usd: number } | null>(null);

  useEffect(() => {
    apiFetch('/spending/me').then((data) => {
      if (data.limit_usd != null && data.percent != null && data.percent >= 80) {
        setSpendingWarning({ percent: data.percent, limit_usd: data.limit_usd });
      } else {
        setSpendingWarning(null);
      }
    }).catch(() => {});
  }, []);

  const isPendingApproval = currentSession
    ? !!(sessionActivity[currentSession.id]?.pendingApproval)
    : false;

  const currentSessionTokens = currentSession && sessionTokens
    ? (sessionTokens[currentSession.id] ?? { inputTokens: 0, outputTokens: 0 })
    : { inputTokens: 0, outputTokens: 0 };

  // Slash command menu
  const slashCtx = {
    clearMessages: () => { /* messages are managed by parent */ },
    sendMessage: (content: string) => onSendMessage(content, THINKING_BUDGETS[thinkingMode]),
    newSession: () => onNewSession(currentWorkspace || ''),
    setInput,
  };
  const {
    menuOpen: slashMenuOpen,
    filteredCommands,
    selectedIndex: slashIndex,
    handleKeyDown: slashKeyDownRaw,
    handleInputChange: slashHandleInputChange,
    selectCommand,
    closeMenu: closeSlashMenu,
    processInput,
  } = useSlashCommands(slashCtx, currentWorkspace);

  // File mention dropdown — reuse inputRef as textareaRef
  const {
    mentionOpen: fileMentionOpen,
    suggestions: fileSuggestions,
    selectedIndex: fileMentionIndex,
    handleKeyDown: fileMentionKeyDownRaw,
    selectSuggestion: selectFileSuggestion,
    closeMention: closeFileMention,
  } = useFileMentions({
    workspaceName: currentWorkspace,
    input,
    setInput,
    textareaRef: inputRef,
  });

  // Track whether the user is near the bottom of the message list
  useEffect(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const handleScroll = () => {
      isAtBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    };
    el.addEventListener('scroll', handleScroll, { passive: true });
    return () => el.removeEventListener('scroll', handleScroll);
  }, []);

  // Auto-scroll only when the user is already at the bottom
  useEffect(() => {
    if (isAtBottom.current) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, agentStatus]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isResizing.current = true;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing.current) return;
      const newWidth = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, e.clientX));
      setSidebarWidth(newWidth);
    };

    const handleMouseUp = () => {
      isResizing.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }, []);

  const noWorkspace = !currentWorkspace && !currentSession;

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading || noWorkspace || isPendingApproval) return;
    const processed = processInput(input.trim());
    if (processed === null) { setInput(''); return; } // side-effect command (e.g. /clear, /new)
    isAtBottom.current = true;
    onSendMessage(processed, THINKING_BUDGETS[thinkingMode]);
    setInput('');
    if (inputRef.current) {
      inputRef.current.style.height = 'auto';
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (slashMenuOpen) {
      const handled = slashKeyDownRaw(e);
      if (handled) { e.preventDefault(); return; }
    }
    if (fileMentionOpen) {
      const handled = fileMentionKeyDownRaw(e);
      if (handled) { e.preventDefault(); return; }
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setInput(val);
    const el = e.target;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 200) + 'px';

    // Sync slash command menu
    slashHandleInputChange(val);
  };

  // Sessions filtered to the current workspace
  const workspaceSessions = currentWorkspace
    ? sessions.filter(s => s.workspaceName === currentWorkspace)
    : sessions;

  const lastMsg = messages[messages.length - 1];
  const showThinking = isLoading && agentStatus && !(lastMsg?.streaming);

  return (
    <div className="flex flex-1 min-h-0 w-full">
      {/* Sidebar */}
      <div
        className={`fixed inset-y-0 left-0 z-40 bg-muted border-r border-border flex flex-col transform transition-all duration-200 md:relative md:translate-x-0 md:top-auto md:inset-y-auto ${
          mobileSidebarOpen ? 'translate-x-0' : '-translate-x-full'
        } ${sidebarCollapsed ? 'md:w-0 md:overflow-hidden md:border-r-0' : ''}`}
        style={sidebarCollapsed ? undefined : { width: `${sidebarWidth}px`, maxWidth: '85vw' }}
      >
        {/* Workspace switcher */}
        <div className="p-3 border-b border-border shrink-0 space-y-2">
          <WorkspaceSwitcher
            currentWorkspace={currentWorkspace}
            workspaces={workspaces}
            onSelect={onWorkspaceChange}
            onGoToDashboard={onGoToDashboard}
          />
          <button
            onClick={() => {
              if (currentWorkspace) {
                onNewSession(currentWorkspace);
              }
            }}
            disabled={!currentWorkspace}
            className="w-full flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <Plus size={14} />
            New Chat
          </button>
        </div>

        {/* Sessions list */}
        <div className="flex-1 overflow-y-auto flex flex-col">
          <div className="flex-1">
          {workspaceSessions.map((s) => {
            const activity = sessionActivity[s.id];
            const isActive = currentSession?.id === s.id;
            return (
              <div
                key={s.id}
                className={`group flex items-center border-b border-border/50 ${
                  isActive ? 'bg-background' : 'hover:bg-background/50'
                }`}
              >
                <button
                  onClick={() => {
                    onJoinSession(s.id);
                  }}
                  className={`flex-1 min-w-0 text-left px-4 py-3 text-base transition-colors ${
                    isActive ? 'text-foreground' : 'text-muted-foreground'
                  }`}
                >
                  <span className="truncate block">{s.title}</span>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-xs text-muted-foreground">{new Date(s.createdAt).toLocaleDateString()}</span>
                    {(sessionCosts[s.id] ?? 0) > 0 && (
                      <span className="text-[10px] text-muted-foreground/70 font-mono">${sessionCosts[s.id].toFixed(4)}</span>
                    )}
                  </div>
                </button>
                {/* Status indicators — always visible, vertically centred */}
                {activity?.isLoading && (
                  <Loader2 size={13} className="shrink-0 animate-spin text-primary mr-1" />
                )}
                {!isActive && activity?.hasUnread && !activity?.isLoading && (
                  <span className="shrink-0 w-2 h-2 rounded-full bg-blue-500 mr-1" />
                )}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onReplaySession(s.id);
                  }}
                  className="shrink-0 p-2 text-muted-foreground hover:text-primary transition-all sm:opacity-0 sm:group-hover:opacity-100"
                  title="Replay session"
                >
                  <PlayCircle size={14} />
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onDeleteSession(s.id);
                  }}
                  className="shrink-0 p-2 mr-1 text-muted-foreground hover:text-destructive transition-all sm:opacity-0 sm:group-hover:opacity-100"
                  title="Delete session"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            );
          })}
          </div>
          {currentSession && (
            <AgentSidebar
              agents={agents || []}
              activeAgentId={activeRole?.name}
              onCreateAgent={onCreateAgent || (() => {})}
            />
          )}
        </div>

      </div>

      {/* Resize handle — desktop only */}
      {!sidebarCollapsed && (
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize sidebar"
          tabIndex={0}
          onMouseDown={handleMouseDown}
          onKeyDown={(e) => {
            const step = 16;
            if (e.key === 'ArrowRight') setSidebarWidth((w) => Math.min(MAX_WIDTH, w + step));
            else if (e.key === 'ArrowLeft') setSidebarWidth((w) => Math.max(MIN_WIDTH, w - step));
          }}
          className="hidden md:flex w-1 cursor-col-resize items-center justify-center hover:bg-primary/30 active:bg-primary/50 focus:bg-primary/30 focus:outline-none transition-colors shrink-0"
        />
      )}

      {/* Sidebar overlay on mobile */}
      {mobileSidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/50 md:hidden"
          onClick={() => { setMobileSidebarOpen(false); }}
        />
      )}

      {/* Main content area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top bar: collapse toggle (desktop) + mobile menu */}
        <div className="flex items-center gap-2 px-2 py-1.5 border-b border-border md:border-b-0 shrink-0">
          <button
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            className="hidden md:flex items-center justify-center w-9 h-9 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
            title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {sidebarCollapsed ? <PanelLeftOpen size={22} /> : <PanelLeftClose size={22} />}
          </button>
          <button
            onClick={() => setMobileSidebarOpen(true)}
            className="p-1.5 rounded-md hover:bg-muted transition-colors md:hidden"
          >
            <Menu size={20} />
          </button>
          <div className="flex-1" />
          <ThinkingModeSelector value={thinkingMode} onChange={setThinkingMode} />
          {currentSessionTokens.inputTokens + currentSessionTokens.outputTokens > 0 && (
            <TokenPie
              inputTokens={currentSessionTokens.inputTokens}
              outputTokens={currentSessionTokens.outputTokens}
              model="claude-sonnet-4-6"
            />
          )}
        </div>

        {/* Spending warning banner */}
        {spendingWarning && (
          <div className="mx-3 sm:mx-6 mt-3 flex items-center gap-2 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-300 dark:border-amber-700 px-4 py-2.5">
            <AlertTriangle size={15} className="shrink-0 text-amber-600 dark:text-amber-400" />
            <span className="text-sm text-amber-800 dark:text-amber-300">
              You've used {Math.round(spendingWarning.percent)}% of your ${spendingWarning.limit_usd.toFixed(2)} monthly limit
            </span>
          </div>
        )}

        {/* Messages */}
        <div ref={scrollContainerRef} className="flex-1 overflow-y-auto py-6">
          {messages.length === 0 && !isLoading && (
            <div className="flex items-center justify-center h-full">
              <div className="text-center space-y-3">
                <h2 className="text-2xl font-semibold">Srijan</h2>
                <p className="text-muted-foreground text-sm max-w-sm">
                  Tell me what to build. I can create apps, deploy containers, and give you live URLs.
                </p>
              </div>
            </div>
          )}

          <div className="max-w-5xl mx-auto px-3 sm:px-6 space-y-3">
            {messages.map((msg) => {
              if (msg.role === 'tool') {
                return <ToolMessage key={msg.id} msg={msg} />;
              }

              if (msg.role === 'plan' && msg.planSteps) {
                return (
                  <PlanCard
                    key={msg.id}
                    title={msg.planTitle || msg.content}
                    steps={msg.planSteps}
                    onExecuteAll={() => {
                      // Send "proceed with executing the plan" message
                      onSendMessage('Please proceed with executing the plan.');
                    }}
                    onCancel={() => {
                      onSendMessage('Skip the plan and proceed directly.');
                    }}
                  />
                );
              }

              return (
                <div
                  key={msg.id}
                  className={`flex w-full min-w-0 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[85%] min-w-0 overflow-hidden rounded-2xl px-4 py-3 text-base break-words ${
                      msg.role === 'user'
                        ? 'bg-primary text-primary-foreground'
                        : msg.role === 'system'
                        ? 'bg-destructive/20 text-destructive border border-destructive/30'
                        : 'bg-muted border border-border'
                    }`}
                  >
                    {msg.role === 'assistant' && msg.agentId && msg.agentId !== 'default' && (
                      <div className={`flex items-center gap-1 text-xs font-medium mb-1 ${getAgentColor(msg.agentId)}`}>
                        <Circle size={8} fill="currentColor" />
                        <span>@{msg.agentId}</span>
                      </div>
                    )}
                    {msg.role === 'assistant' ? (
                      <div className="prose prose-invert prose-base max-w-none break-words overflow-hidden [&_pre]:bg-background [&_pre]:rounded-lg [&_pre]:p-3 [&_pre]:overflow-x-auto [&_pre]:max-w-full [&_code]:text-secondary-foreground [&_code]:break-all">
                        <ReactMarkdown rehypePlugins={[rehypeSanitize]}>{msg.content}</ReactMarkdown>
                        {msg.streaming && (
                          <span className="inline-block w-2 h-4 bg-primary animate-pulse ml-0.5" />
                        )}
                      </div>
                    ) : (
                      <p className="whitespace-pre-wrap break-words">{msg.content}</p>
                    )}
                  </div>
                </div>
              );
            })}

            {showThinking && <ThinkingIndicator status={agentStatus} />}

            <div ref={messagesEndRef} />
          </div>
        </div>

        {/* Input */}
        <div className="px-3 sm:px-6 pb-5">
          {/* Approval bar */}
          {isPendingApproval && (
            <div className="max-w-5xl mx-auto mb-3">
              <PermissionBanner
                sessionId={currentSession?.id ?? null}
                onSendApproval={(response) => onSendMessage(response)}
              />
            </div>
          )}
          <form onSubmit={handleSubmit} className="max-w-5xl mx-auto">
            {activeRole && (
              <div className="flex items-center gap-2 mb-2">
                <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-primary/10 text-primary text-xs font-medium">
                  <Bot size={11} />
                  <span>@{activeRole.name}</span>
                </div>
                <span className="text-xs text-muted-foreground">{activeRole.displayName} mode active</span>
              </div>
            )}
            <div className="relative">
              {slashMenuOpen && (
                <CommandMenu
                  commands={filteredCommands}
                  selectedIndex={slashIndex}
                  onSelect={selectCommand}
                  onClose={closeSlashMenu}
                />
              )}
              {fileMentionOpen && (
                <FileMentionDropdown
                  suggestions={fileSuggestions}
                  selectedIndex={fileMentionIndex}
                  onSelect={selectFileSuggestion}
                  onClose={closeFileMention}
                />
              )}
              <div className="rounded-2xl border border-border bg-muted focus-within:ring-2 focus-within:ring-primary">
                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={handleInput}
                  onKeyDown={handleKeyDown}
                  enterKeyHint="enter"
                  disabled={noWorkspace || isPendingApproval}
                  placeholder={noWorkspace ? 'Select a workspace to start chatting…' : isPendingApproval ? 'Approve or deny above before continuing…' : 'Type a message...'}
                  rows={1}
                  className="w-full bg-transparent resize-none px-4 py-3 pr-14 max-h-[200px] outline-none text-base placeholder:text-muted-foreground disabled:opacity-50 disabled:cursor-not-allowed"
                />
                {isLoading ? (
                  <button
                    type="button"
                    onClick={onAbortSession}
                    className="absolute bottom-2 right-2 rounded-xl bg-destructive p-2 text-destructive-foreground hover:bg-destructive/90 transition-colors"
                    title="Stop agent"
                  >
                    <Square size={18} />
                  </button>
                ) : (
                  <button
                    type="submit"
                    disabled={!input.trim() || noWorkspace || isPendingApproval}
                    className="absolute bottom-2 right-2 rounded-xl bg-primary p-2 text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
                  >
                    <Send size={18} />
                  </button>
                )}
              </div>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
