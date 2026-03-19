import { useState, useRef, useEffect, useCallback, FormEvent } from 'react';
import {
  Send, Plus, Menu, Loader2, Trash2, PlayCircle,
  PanelLeftClose, PanelLeftOpen, CheckCircle2, XCircle, Terminal,
  FileText, Search, FolderSearch, Bot, ChevronDown, ChevronRight,
} from 'lucide-react';
import type { ChatMessage, Session, WorkspaceInfo, SessionActivity } from '../hooks/useChat';
import ReactMarkdown from 'react-markdown';
import { apiFetch } from '../lib/api';

interface ChatProps {
  messages: ChatMessage[];
  sessions: Session[];
  currentSession: Session | null;
  isLoading: boolean;
  agentStatus: string;
  sessionActivity: Record<string, SessionActivity>;
  sessionCosts: Record<string, number>;
  currentWorkspace: string | null;
  workspaces: WorkspaceInfo[];
  onSendMessage: (content: string) => void;
  onNewSession: (workspaceName: string) => void;
  onJoinSession: (sessionId: string) => void;
  onDeleteSession: (sessionId: string) => void;
  onWorkspaceChange: (name: string) => void;
  onCreateWorkspace: (name: string) => Promise<void>;
  onReplaySession: (sessionId: string) => void;
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
        <span className="truncate max-w-md">{msg.content}</span>
        {hasDetails && (expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />)}
      </button>

      {expanded && hasDetails && (
        <div className="ml-2 w-full max-w-2xl rounded-lg border border-border/50 bg-background text-xs font-mono overflow-hidden">
          {msg.toolInput && (
            <div className="px-3 py-2 border-b border-border/30">
              <div className="text-muted-foreground mb-1 text-[10px] uppercase tracking-wider">Input</div>
              <pre className="whitespace-pre-wrap break-all text-foreground/80 max-h-40 overflow-y-auto">
                {typeof msg.toolInput === 'string' ? msg.toolInput : JSON.stringify(msg.toolInput, null, 2)}
              </pre>
            </div>
          )}
          {msg.toolResult && (
            <div className="px-3 py-2">
              <div className={`mb-1 text-[10px] uppercase tracking-wider ${isError ? 'text-destructive' : 'text-muted-foreground'}`}>
                {isError ? 'Error' : 'Output'}
              </div>
              <pre className="whitespace-pre-wrap break-all text-foreground/80 max-h-60 overflow-y-auto">
                {msg.toolResult}
              </pre>
            </div>
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
  onCreateWorkspace,
}: {
  currentWorkspace: string | null;
  workspaces: WorkspaceInfo[];
  onSelect: (name: string) => void;
  onCreateWorkspace: (name: string) => Promise<void>;
}) {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [creating, setCreating] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  useEffect(() => {
    if (createOpen) inputRef.current?.focus();
  }, [createOpen]);

  const handleCreate = async () => {
    if (!newName.trim() || creating) return;
    setCreating(true);
    try {
      await onCreateWorkspace(newName.trim());
      onSelect(newName.trim());
      setNewName('');
      setCreateOpen(false);
    } catch { /* ignore */ }
    setCreating(false);
  };

  return (
    <div className="space-y-1.5">
      <p className="px-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/70">
        Workspace
      </p>

      <div className="flex items-center gap-1">
        {/* Dropdown */}
        <div ref={dropdownRef} className="relative flex-1 min-w-0">
          <button
            onClick={() => { setDropdownOpen(!dropdownOpen); setCreateOpen(false); }}
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
            </div>
          )}
        </div>

        {/* Add workspace button */}
        <button
          onClick={() => { setCreateOpen(!createOpen); setDropdownOpen(false); }}
          title="New workspace"
          className={`shrink-0 w-8 h-8 flex items-center justify-center rounded-lg border transition-colors ${
            createOpen
              ? 'bg-primary/10 border-primary/30 text-primary'
              : 'border-border bg-background text-muted-foreground hover:bg-muted hover:text-foreground'
          }`}
        >
          <Plus size={15} />
        </button>
      </div>

      {/* Inline create form */}
      {createOpen && (
        <div className="flex gap-1">
          <input
            ref={inputRef}
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="workspace-name"
            className="flex-1 min-w-0 rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-primary"
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleCreate();
              if (e.key === 'Escape') { setCreateOpen(false); setNewName(''); }
            }}
          />
          <button
            onClick={handleCreate}
            disabled={!newName.trim() || creating}
            className="shrink-0 px-2.5 py-1.5 text-xs bg-primary text-primary-foreground rounded-lg disabled:opacity-50 font-medium"
          >
            {creating ? <Loader2 size={12} className="animate-spin" /> : 'Create'}
          </button>
        </div>
      )}
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
  currentWorkspace,
  workspaces,
  onSendMessage,
  onNewSession,
  onJoinSession,
  onDeleteSession,
  onWorkspaceChange,
  onCreateWorkspace,
  onReplaySession,
}: ChatProps) {
  const [input, setInput] = useState('');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(DEFAULT_WIDTH);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const isResizing = useRef(false);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
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
    if (!input.trim() || isLoading || noWorkspace) return;
    onSendMessage(input.trim());
    setInput('');
    if (inputRef.current) {
      inputRef.current.style.height = 'auto';
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    const el = e.target;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 200) + 'px';
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
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        } ${sidebarCollapsed ? 'md:w-0 md:overflow-hidden md:border-r-0' : ''}`}
        style={sidebarCollapsed ? undefined : { width: `${sidebarWidth}px` }}
      >
        {/* Workspace switcher */}
        <div className="p-3 border-b border-border shrink-0 space-y-2">
          <WorkspaceSwitcher
            currentWorkspace={currentWorkspace}
            workspaces={workspaces}
            onSelect={onWorkspaceChange}
            onCreateWorkspace={onCreateWorkspace}
          />
          <button
            onClick={() => {
              if (currentWorkspace) {
                onNewSession(currentWorkspace);
                setSidebarOpen(false);
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
        <div className="flex-1 overflow-y-auto">
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
                    setSidebarOpen(false);
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
                  className="shrink-0 p-2 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-primary transition-all"
                  title="Replay session"
                >
                  <PlayCircle size={14} />
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onDeleteSession(s.id);
                  }}
                  className="shrink-0 p-2 mr-1 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-all"
                  title="Delete session"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            );
          })}
        </div>

      </div>

      {/* Resize handle — desktop only */}
      {!sidebarCollapsed && (
        <div
          onMouseDown={handleMouseDown}
          className="hidden md:flex w-1 cursor-col-resize items-center justify-center hover:bg-primary/30 active:bg-primary/50 transition-colors shrink-0"
        />
      )}

      {/* Sidebar overlay on mobile */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/50 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Main content area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top bar: collapse toggle (desktop) + mobile menu */}
        <div className="flex items-center px-2 py-1.5 border-b border-border md:border-b-0 shrink-0">
          <button
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            className="hidden md:flex items-center justify-center w-9 h-9 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
            title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {sidebarCollapsed ? <PanelLeftOpen size={22} /> : <PanelLeftClose size={22} />}
          </button>
          <button
            onClick={() => setSidebarOpen(true)}
            className="p-1.5 rounded-md hover:bg-muted transition-colors md:hidden"
          >
            <Menu size={20} />
          </button>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto py-6">
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

          <div className="max-w-5xl mx-auto px-6 space-y-3">
            {messages.map((msg) => {
              if (msg.role === 'tool') {
                return <ToolMessage key={msg.id} msg={msg} />;
              }

              return (
                <div
                  key={msg.id}
                  className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[80%] rounded-2xl px-4 py-3 text-base ${
                      msg.role === 'user'
                        ? 'bg-primary text-primary-foreground'
                        : msg.role === 'system'
                        ? 'bg-destructive/20 text-destructive border border-destructive/30'
                        : 'bg-muted border border-border'
                    }`}
                  >
                    {msg.role === 'assistant' ? (
                      <div className="prose prose-invert prose-base max-w-none [&_pre]:bg-background [&_pre]:rounded-lg [&_pre]:p-3 [&_code]:text-secondary-foreground">
                        <ReactMarkdown>{msg.content}</ReactMarkdown>
                        {msg.streaming && (
                          <span className="inline-block w-2 h-4 bg-primary animate-pulse ml-0.5" />
                        )}
                      </div>
                    ) : (
                      <p className="whitespace-pre-wrap">{msg.content}</p>
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
        <div className="px-6 pb-5">
          <form onSubmit={handleSubmit} className="max-w-5xl mx-auto">
            <div className="relative rounded-2xl border border-border bg-muted focus-within:ring-2 focus-within:ring-primary">
              <textarea
                ref={inputRef}
                value={input}
                onChange={handleInput}
                onKeyDown={handleKeyDown}
                disabled={noWorkspace}
                placeholder={noWorkspace ? 'Select a workspace to start chatting…' : 'Type a message...'}
                rows={2}
                className="w-full bg-transparent resize-none px-4 pt-4 pb-14 max-h-[200px] outline-none text-base placeholder:text-muted-foreground disabled:opacity-50 disabled:cursor-not-allowed"
              />
              <button
                type="submit"
                disabled={!input.trim() || isLoading || noWorkspace}
                className="absolute bottom-3 right-3 rounded-xl bg-primary p-2.5 text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
              >
                {isLoading ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
