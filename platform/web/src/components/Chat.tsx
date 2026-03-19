import { useState, useRef, useEffect, FormEvent } from 'react';
import { Send, Plus, Menu, Settings as SettingsIcon, Loader2, Trash2 } from 'lucide-react';
import type { ChatMessage, Session } from '../hooks/useChat';
import ReactMarkdown from 'react-markdown';

interface ChatProps {
  messages: ChatMessage[];
  sessions: Session[];
  currentSession: Session | null;
  isLoading: boolean;
  onSendMessage: (content: string) => void;
  onNewSession: () => void;
  onJoinSession: (sessionId: string) => void;
  onDeleteSession: (sessionId: string) => void;
  onOpenSettings: () => void;
}

export function Chat({
  messages,
  sessions,
  currentSession,
  isLoading,
  onSendMessage,
  onNewSession,
  onJoinSession,
  onDeleteSession,
  onOpenSettings,
}: ChatProps) {
  const [input, setInput] = useState('');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

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

  return (
    <div className="flex flex-1 min-h-0 w-full">
      {/* Sidebar */}
      <div
        className={`fixed inset-y-0 left-0 z-40 w-60 bg-muted border-r border-border flex flex-col transform transition-transform duration-200 md:relative md:translate-x-0 md:top-auto md:inset-y-auto ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* New Chat button */}
        <div className="p-3 border-b border-border shrink-0">
          <button
            onClick={() => {
              onNewSession();
              setSidebarOpen(false);
            }}
            className="w-full flex items-center gap-2 px-3 py-2.5 rounded-lg bg-primary text-primary-foreground text-base font-medium hover:bg-primary/90 transition-colors"
          >
            <Plus size={16} />
            New Chat
          </button>
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
                <div className="text-xs text-muted-foreground mt-0.5">
                  {new Date(s.createdAt).toLocaleDateString()}
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

      {/* Sidebar overlay on mobile */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/50 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Main chat area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Mobile menu button */}
        <div className="flex items-center px-4 py-2 border-b border-border md:hidden">
          <button
            onClick={() => setSidebarOpen(true)}
            className="p-1.5 rounded-md hover:bg-muted transition-colors"
          >
            <Menu size={20} />
          </button>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto py-6">
          {messages.length === 0 && (
            <div className="flex items-center justify-center h-full">
              <div className="text-center space-y-3">
                <h2 className="text-2xl font-semibold">Srijan</h2>
                <p className="text-muted-foreground text-sm max-w-sm">
                  Tell me what to build. I can create apps, deploy containers, and give you live URLs.
                </p>
              </div>
            </div>
          )}

          <div className="max-w-3xl mx-auto px-6 space-y-5">
            {messages.map((msg) => (
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
            ))}
            <div ref={messagesEndRef} />
          </div>
        </div>

        {/* Input — pill style */}
        <div className="px-6 pb-5">
          <form onSubmit={handleSubmit} className="max-w-3xl mx-auto">
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
      </div>
    </div>
  );
}
