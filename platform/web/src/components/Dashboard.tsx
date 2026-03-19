import { useState, useEffect, useCallback } from 'react';
import { RefreshCw, Play, Square, ChevronDown, ChevronRight, ExternalLink } from 'lucide-react';
import { apiFetch } from '../lib/api';

interface ContainerInfo {
  Id: string;
  Names: string[];
  Image: string;
  Status: string;
  State: string;
  Ports: { PublicPort?: number; PrivatePort: number; Type: string }[];
}

interface AppInfo {
  id: string;
  name: string;
  path: string;
  port: number;
  container_id: string | null;
  status: string;
}

function statusColor(state: string) {
  if (state === 'running') return 'bg-green-500';
  if (state === 'exited') return 'bg-red-500';
  return 'bg-yellow-500';
}

function ContainerRow({ container, app, onAction }: {
  container: ContainerInfo;
  app?: AppInfo;
  onAction: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [logs, setLogs] = useState<string>('');
  const [loadingLogs, setLoadingLogs] = useState(false);
  const [actioning, setActioning] = useState(false);
  const isRunning = container.State === 'running';
  const displayName = container.Names[0]?.replace(/^\//, '') || container.Id.slice(0, 12);

  const fetchLogs = async () => {
    if (logs) { setExpanded(!expanded); return; }
    setLoadingLogs(true);
    try {
      const data = await apiFetch(`/containers/${container.Id}/logs?tail=100`);
      setLogs(data.logs || '');
    } catch { setLogs('Failed to fetch logs.'); }
    setLoadingLogs(false);
    setExpanded(true);
  };

  const toggleContainer = async () => {
    setActioning(true);
    try {
      if (isRunning) {
        await apiFetch(`/containers/${container.Id}/stop`, { method: 'POST' });
      } else {
        await apiFetch(`/containers/${container.Id}/start`, { method: 'POST' });
      }
      onAction();
    } catch { /* ignore */ }
    setActioning(false);
  };

  return (
    <div className="rounded-xl border border-border overflow-hidden">
      <div className="flex items-center gap-3 px-4 py-3">
        <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${statusColor(container.State)}`} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-mono text-sm font-medium truncate">{displayName}</span>
            {app && (
              <a
                href={app.path}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-0.5 text-xs text-primary hover:underline"
              >
                <ExternalLink size={11} />
                {app.path}
              </a>
            )}
          </div>
          <div className="text-xs text-muted-foreground mt-0.5">{container.Image} · {container.Status}</div>
        </div>
        <button
          onClick={fetchLogs}
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground px-2 py-1 rounded-lg hover:bg-muted transition-colors"
        >
          {loadingLogs ? <RefreshCw size={12} className="animate-spin" /> : (expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />)}
          Logs
        </button>
        <button
          onClick={toggleContainer}
          disabled={actioning}
          title={isRunning ? 'Stop' : 'Start'}
          className={`p-1.5 rounded-lg transition-colors ${isRunning ? 'hover:bg-destructive/10 hover:text-destructive' : 'hover:bg-green-500/10 hover:text-green-600'} text-muted-foreground`}
        >
          {isRunning ? <Square size={15} /> : <Play size={15} />}
        </button>
      </div>

      {expanded && (
        <div className="border-t border-border bg-background px-4 py-3">
          <pre className="text-xs font-mono text-foreground/80 whitespace-pre-wrap break-all max-h-64 overflow-y-auto">
            {logs || '(no logs)'}
          </pre>
        </div>
      )}
    </div>
  );
}

export function Dashboard() {
  const [containers, setContainers] = useState<ContainerInfo[]>([]);
  const [apps, setApps] = useState<AppInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchData = useCallback(async () => {
    try {
      const [c, a] = await Promise.all([
        apiFetch('/containers'),
        apiFetch('/apps'),
      ]);
      setContainers(c);
      setApps(a);
      setError('');
    } catch (err: any) {
      setError(err.message || 'Failed to load data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 10000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const appByContainer = (id: string) => apps.find((a) => a.container_id === id);

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-y-auto">
      <div className="px-6 py-5 border-b border-border flex items-center justify-between shrink-0">
        <h2 className="font-semibold text-lg">App Dashboard</h2>
        <button
          onClick={fetchData}
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground px-3 py-1.5 rounded-lg hover:bg-muted transition-colors"
        >
          <RefreshCw size={14} />
          Refresh
        </button>
      </div>

      <div className="flex-1 p-6">
        {loading && (
          <div className="flex items-center justify-center h-40 text-muted-foreground text-sm">
            Loading…
          </div>
        )}

        {error && (
          <div className="rounded-xl border border-destructive/30 bg-destructive/10 text-destructive px-4 py-3 text-sm">
            {error}
          </div>
        )}

        {!loading && !error && containers.length === 0 && (
          <div className="flex items-center justify-center h-40 text-muted-foreground text-sm">
            No containers found.
          </div>
        )}

        {!loading && containers.length > 0 && (
          <div className="max-w-4xl mx-auto space-y-3">
            {containers.map((c) => (
              <ContainerRow
                key={c.Id}
                container={c}
                app={appByContainer(c.Id)}
                onAction={fetchData}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
