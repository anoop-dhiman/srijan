import { useState, useCallback } from 'react';
import { RefreshCw, Play, Square, ChevronDown, ChevronRight, ExternalLink, FolderOpen, MessageSquare } from 'lucide-react';
import { apiFetch } from '../lib/api';
import type { WorkspaceInfo } from '../hooks/useChat';

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
  workspace_name: string | null;
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
    <div className="rounded-lg border border-border overflow-hidden">
      <div className="flex items-center gap-3 px-3 py-2.5">
        <div className={`w-2 h-2 rounded-full shrink-0 ${statusColor(container.State)}`} />
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
          {isRunning ? <Square size={14} /> : <Play size={14} />}
        </button>
      </div>

      {expanded && (
        <div className="border-t border-border bg-background px-3 py-2">
          <pre className="text-xs font-mono text-foreground/80 whitespace-pre-wrap break-all max-h-48 overflow-y-auto">
            {logs || '(no logs)'}
          </pre>
        </div>
      )}
    </div>
  );
}

function WorkspaceCard({ workspace, onViewSessions }: {
  workspace: WorkspaceInfo;
  onViewSessions: (name: string) => void;
}) {
  const [containersOpen, setContainersOpen] = useState(false);
  const [containers, setContainers] = useState<ContainerInfo[]>([]);
  const [apps, setApps] = useState<AppInfo[]>([]);
  const [loadingContainers, setLoadingContainers] = useState(false);

  const toggleContainers = useCallback(async () => {
    if (containersOpen) {
      setContainersOpen(false);
      return;
    }
    setLoadingContainers(true);
    try {
      const [c, a] = await Promise.all([
        apiFetch(`/containers?workspace=${encodeURIComponent(workspace.name)}`),
        apiFetch('/apps'),
      ]);
      setContainers(c);
      setApps(a);
    } catch { /* ignore */ }
    setLoadingContainers(false);
    setContainersOpen(true);
  }, [containersOpen, workspace.name]);

  const appByContainer = (id: string) => apps.find(a => a.container_id === id);

  const lastActive = workspace.lastActivityAt
    ? new Date(workspace.lastActivityAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
    : null;

  const hasActivity = workspace.runningContainerCount > 0 || workspace.sessionCount > 0;

  return (
    <div className="rounded-xl border border-border bg-background overflow-hidden">
      <div className="px-5 py-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <FolderOpen size={18} className="text-muted-foreground shrink-0" />
            <span className="font-semibold font-mono truncate">{workspace.name}</span>
            {hasActivity && (
              <span className="text-[10px] bg-green-500/15 text-green-600 border border-green-500/30 px-1.5 py-0.5 rounded-full font-medium shrink-0">
                active
              </span>
            )}
          </div>
          {workspace.totalCostUsd != null && (
            <span className="text-sm font-mono text-muted-foreground shrink-0">${workspace.totalCostUsd.toFixed(4)}</span>
          )}
        </div>

        <div className="mt-2 flex items-center gap-4 text-sm text-muted-foreground">
          <span>{workspace.sessionCount} session{workspace.sessionCount !== 1 ? 's' : ''}</span>
          <span>{workspace.runningContainerCount} container{workspace.runningContainerCount !== 1 ? 's' : ''}</span>
          {lastActive && <span>Last active {lastActive}</span>}
        </div>

        <div className="mt-3 flex items-center gap-2">
          <button
            onClick={() => onViewSessions(workspace.name)}
            className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg bg-primary/10 text-primary hover:bg-primary/20 transition-colors font-medium"
          >
            <MessageSquare size={14} />
            View Sessions
          </button>
          <button
            onClick={toggleContainers}
            className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg border border-border hover:bg-muted transition-colors"
          >
            {loadingContainers ? (
              <RefreshCw size={14} className="animate-spin" />
            ) : containersOpen ? (
              <ChevronDown size={14} />
            ) : (
              <ChevronRight size={14} />
            )}
            Containers
          </button>
        </div>
      </div>

      {containersOpen && (
        <div className="border-t border-border px-4 py-3 space-y-2">
          {containers.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-2">No registered containers for this workspace.</p>
          ) : (
            containers.map(c => (
              <ContainerRow
                key={c.Id}
                container={c}
                app={appByContainer(c.Id)}
                onAction={toggleContainers}
              />
            ))
          )}
        </div>
      )}
    </div>
  );
}

interface DashboardProps {
  workspaces: WorkspaceInfo[];
  onRefresh: () => void;
  onViewSessions: (workspace: string) => void;
}

export function Dashboard({ workspaces, onRefresh, onViewSessions }: DashboardProps) {
  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-y-auto">
      <div className="px-6 py-5 border-b border-border flex items-center justify-between shrink-0">
        <h2 className="font-semibold text-lg">Dashboard</h2>
        <button
          onClick={onRefresh}
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground px-3 py-1.5 rounded-lg hover:bg-muted transition-colors"
        >
          <RefreshCw size={14} />
          Refresh
        </button>
      </div>

      <div className="flex-1 p-6">
        {workspaces.length === 0 ? (
          <div className="flex items-center justify-center h-40 text-muted-foreground text-sm">
            No workspaces yet. Create one to get started.
          </div>
        ) : (
          <div className="max-w-3xl mx-auto space-y-4">
            {workspaces.map(ws => (
              <WorkspaceCard
                key={ws.name}
                workspace={ws}
                onViewSessions={onViewSessions}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
