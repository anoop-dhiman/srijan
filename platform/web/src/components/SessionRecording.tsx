import { useState, useEffect } from 'react';
import { Loader2, X, Terminal, FileText, Search, FolderSearch, Bot, ChevronDown, ChevronRight, CheckCircle2, XCircle } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { apiFetch } from '../lib/api';

interface RecordingEvent {
  id: number;
  session_id: string;
  type: string;
  data: any;
  created_at: string;
}

interface RecordingSession {
  id: string;
  title: string;
  status: string;
  workspaceName: string | null;
  createdAt: string;
  updatedAt: string;
}

interface SessionRecordingProps {
  sessionId: string;
  onClose: () => void;
}

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

function ToolPill({ event }: { event: RecordingEvent }) {
  const [expanded, setExpanded] = useState(false);
  const isError = event.data?.isError;
  const toolName = event.data?.name || '';
  const label = event.type === 'tool_result'
    ? (isError ? 'Error output' : 'Tool output')
    : `${toolName}: ${JSON.stringify(event.data?.input || {}).slice(0, 60)}`;
  const hasDetails = event.data?.input || event.data?.content;

  return (
    <div className="flex flex-col items-start gap-1">
      <button
        onClick={() => hasDetails && setExpanded(!expanded)}
        className={`flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-mono transition-colors ${
          isError
            ? 'bg-destructive/10 text-destructive border border-destructive/20'
            : 'bg-muted/50 text-muted-foreground border border-border/50 hover:bg-muted'
        } ${hasDetails ? 'cursor-pointer' : 'cursor-default'}`}
      >
        {isError ? <XCircle size={14} className="shrink-0" /> : (
          <>
            {toolIcon(toolName)}
            <CheckCircle2 size={14} className="text-green-500 shrink-0" />
          </>
        )}
        <span className="truncate max-w-md">{label}</span>
        {hasDetails && (expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />)}
      </button>
      {expanded && hasDetails && (
        <div className="ml-2 w-full max-w-2xl rounded-lg border border-border/50 bg-background text-xs font-mono overflow-hidden">
          {event.data?.input && (
            <div className="px-3 py-2 border-b border-border/30">
              <div className="text-muted-foreground mb-1 text-[10px] uppercase tracking-wider">Input</div>
              <pre className="whitespace-pre-wrap break-all text-foreground/80 max-h-40 overflow-y-auto">
                {typeof event.data.input === 'string' ? event.data.input : JSON.stringify(event.data.input, null, 2)}
              </pre>
            </div>
          )}
          {event.data?.content && (
            <div className="px-3 py-2">
              <div className={`mb-1 text-[10px] uppercase tracking-wider ${isError ? 'text-destructive' : 'text-muted-foreground'}`}>
                {isError ? 'Error' : 'Output'}
              </div>
              <pre className="whitespace-pre-wrap break-all text-foreground/80 max-h-60 overflow-y-auto">
                {event.data.content}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function renderEvent(event: RecordingEvent, idx: number) {
  switch (event.type) {
    case 'user_message':
      return (
        <div key={idx} className="flex justify-end">
          <div className="max-w-[80%] rounded-2xl px-4 py-3 text-base bg-primary text-primary-foreground">
            <p className="whitespace-pre-wrap">{event.data?.content}</p>
          </div>
        </div>
      );

    case 'agent_response':
      if (!event.data?.done) return null;
      return (
        <div key={idx} className="flex justify-start">
          <div className="max-w-[80%] rounded-2xl px-4 py-3 text-base bg-muted border border-border">
            <div className="prose prose-invert prose-base max-w-none [&_pre]:bg-background [&_pre]:rounded-lg [&_pre]:p-3 [&_code]:text-secondary-foreground">
              <ReactMarkdown>{event.data?.content || ''}</ReactMarkdown>
            </div>
          </div>
        </div>
      );

    case 'tool_use':
    case 'tool_result':
      return <ToolPill key={idx} event={event} />;

    case 'error':
      return (
        <div key={idx} className="flex justify-start">
          <div className="max-w-[80%] rounded-2xl px-4 py-3 text-base bg-destructive/20 text-destructive border border-destructive/30">
            <p className="whitespace-pre-wrap">{event.data?.message}</p>
          </div>
        </div>
      );

    case 'session_start':
    case 'session_end':
      return (
        <div key={idx} className="text-center text-xs text-muted-foreground/60 py-1">
          {event.type === 'session_start' ? 'Session started' : 'Session ended'}
          {' — '}
          {new Date(event.created_at).toLocaleString()}
        </div>
      );

    default:
      return null;
  }
}

export function SessionRecording({ sessionId, onClose }: SessionRecordingProps) {
  const [session, setSession] = useState<RecordingSession | null>(null);
  const [events, setEvents] = useState<RecordingEvent[]>([]);
  const [totalCost, setTotalCost] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    apiFetch(`/sessions/${sessionId}/recording`)
      .then((data) => {
        setSession(data.session);
        setEvents(data.events);
        setTotalCost(data.totalCostUsd || 0);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [sessionId]);

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Header */}
      <div className="px-6 py-4 border-b border-border flex items-center justify-between shrink-0 bg-muted">
        <div className="flex items-center gap-3">
          <h2 className="font-semibold text-base">
            {session ? session.title : 'Session Recording'}
          </h2>
          {totalCost > 0 && (
            <span className="text-xs font-mono text-muted-foreground bg-background border border-border px-2 py-0.5 rounded-lg">
              ${totalCost.toFixed(4)}
            </span>
          )}
          <span className="text-xs text-muted-foreground bg-muted-foreground/10 border border-border/50 px-2 py-0.5 rounded-lg">
            Read-only replay
          </span>
        </div>
        <button
          onClick={onClose}
          className="p-2 rounded-lg hover:bg-background/60 transition-colors text-muted-foreground hover:text-foreground"
          title="Close replay"
        >
          <X size={18} />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto py-6">
        <div className="max-w-5xl mx-auto px-6 space-y-3">
          {loading && (
            <div className="flex items-center justify-center py-12 gap-2 text-muted-foreground">
              <Loader2 size={18} className="animate-spin" /> Loading recording…
            </div>
          )}

          {error && (
            <div className="flex items-center justify-center py-12">
              <div className="text-center space-y-2">
                <p className="text-destructive font-medium">Failed to load recording</p>
                <p className="text-sm text-muted-foreground">{error}</p>
              </div>
            </div>
          )}

          {!loading && !error && events.map((evt, i) => renderEvent(evt, i))}

          {!loading && !error && events.length === 0 && (
            <div className="flex items-center justify-center py-12">
              <p className="text-muted-foreground text-sm">No events recorded for this session.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
