import { useState, useRef, useEffect, useCallback, FormEvent } from 'react';
import {
  Send, Plus, Menu, Settings as SettingsIcon, Loader2, Trash2,
  PanelLeftClose, PanelLeftOpen, CheckCircle2, XCircle, Terminal,
  FileText, Search, FolderSearch, Bot, ChevronDown, ChevronRight, FolderOpen,
} from 'lucide-react';
import type { ChatMessage, Session } from '../hooks/useChat';
import ReactMarkdown from 'react-markdown';
import { Settings } from './Settings';
import { apiFetch } from '../lib/api';

interface ChatProps {
  messages: ChatMessage[];
  sessions: Session[];
  currentSession: Session | null;
  isLoading: boolean;
  agentStatus: string;
  settingsOpen: boolean;
  sessionCosts: Record<string, number>;
  onSendMessage: (content: string) => void;
  onNewSession: (workspaceName?: string) => void;
  onJoinSession: (sessionId: string) => void;
  onDeleteSession: (sessionId: string) => void;
  onOpenSettings: () => void;
  onCloseSettings: () => void;
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

export function Chat({
  messages,
  sessions,
  currentSession,
  isLoading,
  agentStatus,
  settingsOpen,
  sessionCosts,
  onSendMessage,
  onNewSession,
  onJoinSession,
  onDeleteSession,
  onOpenSettings,
  onCloseSettings,
}: ChatProps) {
  const [input, setInput] = useState('');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(DEFAULT_WIDTH);
  const [workspacePicker, setWorkspacePicker] = useState(false);
  const [workspaces, setWorkspaces] = useState<string[]>([]);
  const [newWorkspaceName, setNewWorkspaceName] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const isResizing = useRef(false);

  const openWorkspacePicker = useCallback(async () => {
    try {
      const list = await apiFetch('/workspaces');
      setWorkspaces(list);
    } catch { setWorkspaces([]); }
    setWorkspacePicker(true);
  }, []);

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

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;
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

  // Check if last message is a streaming assistant message (suppress thinking indicator)
  const lastMsg = messages[messages.length - 1];
  const showThinking = isLoading && agentStatus && !(lastMsg?.streaming);

  return (
    <div className="flex flex-1 min-h-0 w-full">
      {/* Sidebar — desktop: resizable + collapsible, mobile: slide-over */}
      <div
        className={`fixed inset-y-0 left-0 z-40 bg-muted border-r border-border flex flex-col transform transition-all duration-200 md:relative md:translate-x-0 md:top-auto md:inset-y-auto ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        } ${sidebarCollapsed ? 'md:w-0 md:overflow-hidden md:border-r-0' : ''}`}
        style={sidebarCollapsed ? undefined : { width: `${sidebarWidth}px` }}
      >
        {/* New Chat button */}
        <div className="p-3 border-b border-border shrink-0 relative">
          <div className="flex gap-1">
            <button
              onClick={() => { onNewSession(); setSidebarOpen(false); }}
              className="flex-1 flex items-center gap-2 px-3 py-2.5 rounded-lg bg-primary text-primary-foreground text-base font-medium hover:bg-primary/90 transition-colors"
            >
              <Plus size={16} />
              New Chat
            </button>
            <button
              onClick={openWorkspacePicker}
              title="Choose workspace"
              className="flex items-center justify-center px-2.5 rounded-lg bg-primary/20 text-primary hover:bg-primary/30 transition-colors"
            >
              <FolderOpen size={16} />
            </button>
          </div>

          {/* Workspace picker popover */}
          {workspacePicker && (
            <div className="absolute left-3 right-3 top-full mt-1 z-50 rounded-xl border border-border bg-background shadow-lg p-3 space-y-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Choose Workspace</p>
              <button
                onClick={() => { onNewSession(); setWorkspacePicker(false); setSidebarOpen(false); }}
                className="w-full text-left px-3 py-2 rounded-lg text-sm hover:bg-muted transition-colors"
              >
                Default (session ID)
              </button>
              {workspaces.map((ws) => (
                <button
                  key={ws}
                  onClick={() => { onNewSession(ws); setWorkspacePicker(false); setSidebarOpen(false); }}
                  className="w-full text-left px-3 py-2 rounded-lg text-sm font-mono hover:bg-muted transition-colors"
                >
                  {ws}
                </button>
              ))}
              <div className="flex gap-1 pt-1 border-t border-border">
                <input
                  type="text"
                  value={newWorkspaceName}
                  onChange={(e) => setNewWorkspaceName(e.target.value)}
                  placeholder="New workspace name…"
                  className="flex-1 rounded-lg border border-border bg-muted px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && newWorkspaceName.trim()) {
                      apiFetch('/workspaces', { method: 'POST', body: JSON.stringify({ name: newWorkspaceName.trim() }) })
                        .then(() => { onNewSession(newWorkspaceName.trim()); setWorkspacePicker(false); setNewWorkspaceName(''); setSidebarOpen(false); })
                        .catch(() => {});
                    }
                  }}
                />
                <button
                  onClick={() => setWorkspacePicker(false)}
                  className="px-2 py-1.5 text-xs text-muted-foreground hover:text-foreground"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Sessions list */}
        <div className="flex-1 overflow-y-auto">
          {sessions.map((s) => (
            <div
              key={s.id}
              className={`group flex items-center border-b border-border/50 ${
                currentSession?.id === s.id ? 'bg-background' : 'hover:bg-background/50'
              }`}
            >
              <button
                onClick={() => {
                  onJoinSession(s.id);
                  setSidebarOpen(false);
                }}
                className={`flex-1 min-w-0 text-left px-4 py-3 text-base transition-colors ${
                  currentSession?.id === s.id ? 'text-foreground' : 'text-muted-foreground'
                }`}
              >
                <div className="truncate">{s.title}</div>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-xs text-muted-foreground">{new Date(s.createdAt).toLocaleDateString()}</span>
                  {(sessionCosts[s.id] ?? 0) > 0 && (
                    <span className="text-[10px] text-muted-foreground/70 font-mono">${sessionCosts[s.id].toFixed(4)}</span>
                  )}
                </div>
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
          ))}
        </div>

        {/* Settings button */}
        <div className="p-3 border-t border-border shrink-0">
          <button
            onClick={onOpenSettings}
            className="w-full flex items-center gap-2 px-3 py-2.5 rounded-lg text-base text-muted-foreground hover:bg-background hover:text-foreground transition-colors"
          >
            <SettingsIcon size={16} />
            Settings
          </button>
        </div>
      </div>

      {/* Resize handle — desktop only, hidden when collapsed */}
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
          {/* Collapse/expand toggle — desktop */}
          <button
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            className="hidden md:flex items-center justify-center w-9 h-9 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
            title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {sidebarCollapsed ? <PanelLeftOpen size={22} /> : <PanelLeftClose size={22} />}
          </button>
          {/* Mobile menu button */}
          <button
            onClick={() => setSidebarOpen(true)}
            className="p-1.5 rounded-md hover:bg-muted transition-colors md:hidden"
          >
            <Menu size={20} />
          </button>
        </div>

        {settingsOpen ? (
          <Settings open={true} onClose={onCloseSettings} />
        ) : (
          <>
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

            {/* Input — pill style */}
            <div className="px-6 pb-5">
              <form onSubmit={handleSubmit} className="max-w-5xl mx-auto">
                <div className="relative rounded-2xl border border-border bg-muted focus-within:ring-2 focus-within:ring-primary">
                  <textarea
                    ref={inputRef}
                    value={input}
                    onChange={handleInput}
                    onKeyDown={handleKeyDown}
                    placeholder="Type a message..."
                    rows={2}
                    className="w-full bg-transparent resize-none px-4 pt-4 pb-14 max-h-[200px] outline-none text-base placeholder:text-muted-foreground"
                  />
                  <button
                    type="submit"
                    disabled={!input.trim() || isLoading}
                    className="absolute bottom-3 right-3 rounded-xl bg-primary p-2.5 text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
                  >
                    {isLoading ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
                  </button>
                </div>
              </form>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
