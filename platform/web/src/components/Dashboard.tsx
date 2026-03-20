import { useState, useCallback, useEffect, useRef } from 'react';
import {
  RefreshCw, Play, Square, ChevronDown, ChevronRight, ExternalLink, FolderOpen,
  MessageSquare, Globe, GitBranch, Link, Plus, X, Upload, Lock, LockOpen, KeyRound, Trash2,
} from 'lucide-react';
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

interface GitInfo {
  branch: string;
  remoteUrl: string | null;
}

interface GitCredInfo {
  configured: boolean;
  provider?: 'github' | 'azure' | 'generic';
  username?: string;
}

type GitProvider = 'github' | 'azure' | 'generic';

function detectProvider(url: string): GitProvider {
  if (/github\.com/i.test(url)) return 'github';
  if (/dev\.azure\.com|visualstudio\.com/i.test(url)) return 'azure';
  return 'generic';
}

function statusColor(state: string) {
  if (state === 'running') return 'bg-green-500';
  if (state === 'exited') return 'bg-red-500';
  return 'bg-yellow-500';
}

function abbreviateUrl(url: string): string {
  try {
    const u = new URL(url);
    return u.hostname + u.pathname;
  } catch {
    return url;
  }
}

const PROVIDER_LABELS: Record<GitProvider, string> = {
  github: 'GitHub',
  azure: 'Azure DevOps',
  generic: 'Generic Git',
};

const USERNAME_PLACEHOLDERS: Record<GitProvider, string> = {
  github: 'GitHub username',
  azure: 'Any value (e.g. "user")',
  generic: 'Username',
};

const TOKEN_PLACEHOLDERS: Record<GitProvider, string> = {
  github: 'GitHub Personal Access Token (ghp_…)',
  azure: 'Azure DevOps Personal Access Token',
  generic: 'Password or token',
};

/** Inline auth config form reused in GitSection and CreateWorkspacePanel */
function GitAuthFields({
  provider,
  setProvider,
  username,
  setUsername,
  token,
  setToken,
  urlForDetection,
}: {
  provider: GitProvider;
  setProvider: (p: GitProvider) => void;
  username: string;
  setUsername: (v: string) => void;
  token: string;
  setToken: (v: string) => void;
  urlForDetection?: string;
}) {
  // Auto-detect provider when URL changes
  useEffect(() => {
    if (urlForDetection) setProvider(detectProvider(urlForDetection));
  }, [urlForDetection]);

  return (
    <div className="space-y-2">
      <div>
        <label className="text-xs text-muted-foreground mb-1 block">Provider</label>
        <select
          value={provider}
          onChange={e => setProvider(e.target.value as GitProvider)}
          className="w-full text-sm px-3 py-2 rounded-lg border border-border bg-muted focus:outline-none focus:ring-1 focus:ring-primary"
        >
          <option value="github">GitHub</option>
          <option value="azure">Azure DevOps</option>
          <option value="generic">Generic Git (HTTPS)</option>
        </select>
      </div>
      <div>
        <label className="text-xs text-muted-foreground mb-1 block">Username</label>
        <input
          type="text"
          value={username}
          onChange={e => setUsername(e.target.value)}
          placeholder={USERNAME_PLACEHOLDERS[provider]}
          className="w-full text-sm px-3 py-2 rounded-lg border border-border bg-muted focus:outline-none focus:ring-1 focus:ring-primary"
          autoComplete="off"
        />
      </div>
      <div>
        <label className="text-xs text-muted-foreground mb-1 block">Personal Access Token</label>
        <input
          type="password"
          value={token}
          onChange={e => setToken(e.target.value)}
          placeholder={TOKEN_PLACEHOLDERS[provider]}
          className="w-full text-sm px-3 py-2 rounded-lg border border-border bg-muted focus:outline-none focus:ring-1 focus:ring-primary"
          autoComplete="new-password"
        />
        {provider === 'github' && (
          <p className="text-xs text-muted-foreground mt-1">
            Requires <code className="font-mono">repo</code> scope. Generate at GitHub → Settings → Developer settings → Personal access tokens.
          </p>
        )}
        {provider === 'azure' && (
          <p className="text-xs text-muted-foreground mt-1">
            Generate at Azure DevOps → User Settings → Personal access tokens. Needs <code className="font-mono">Code (Read &amp; Write)</code> scope.
          </p>
        )}
      </div>
    </div>
  );
}

function ContainerRow({ container, app, workspaceName, onAction, onRegistered }: {
  container: ContainerInfo;
  app?: AppInfo;
  workspaceName: string;
  onAction: () => void;
  onRegistered: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [logs, setLogs] = useState<string>('');
  const [loadingLogs, setLoadingLogs] = useState(false);
  const [actioning, setActioning] = useState(false);
  const [showRegister, setShowRegister] = useState(false);
  const [regPath, setRegPath] = useState('');
  const [regPort, setRegPort] = useState('');
  const [registering, setRegistering] = useState(false);
  const [regError, setRegError] = useState<string | null>(null);

  const isRunning = container.State === 'running';
  const displayName = container.Names[0]?.replace(/^\//, '') || container.Id.slice(0, 12);

  const defaultServiceName = displayName
    .replace(new RegExp(`^${workspaceName}-`, 'i'), '')
    .replace(/-\d+$/, '');

  const fetchLogs = async () => {
    if (logs && !expanded) { setExpanded(true); return; }
    if (expanded) { setExpanded(false); return; }
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

  const openRegister = () => {
    const firstPublicPort = container.Ports.find(p => p.PublicPort)?.PublicPort;
    setRegPath(`/${defaultServiceName}`);
    setRegPort(firstPublicPort ? String(firstPublicPort) : '');
    setRegError(null);
    setShowRegister(true);
  };

  const submitRegister = async () => {
    if (!regPath || !regPort) { setRegError('Path and port are required.'); return; }
    setRegistering(true);
    setRegError(null);
    try {
      await apiFetch('/apps/register', {
        method: 'POST',
        body: JSON.stringify({
          name: defaultServiceName,
          path: regPath,
          port: parseInt(regPort, 10),
          containerId: container.Id,
          workspaceName,
        }),
      });
      setShowRegister(false);
      onRegistered();
    } catch (err: any) {
      setRegError(err.message || 'Registration failed.');
    }
    setRegistering(false);
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
        {!app && isRunning && (
          <button
            onClick={openRegister}
            title="Register public URL"
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground px-2 py-1 rounded-lg hover:bg-muted transition-colors"
          >
            <Globe size={12} />
            Publish
          </button>
        )}
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
          {actioning ? <RefreshCw size={14} className="animate-spin" /> : isRunning ? <Square size={14} /> : <Play size={14} />}
        </button>
      </div>

      {showRegister && (
        <div className="border-t border-border bg-muted/30 px-3 py-2.5 space-y-2">
          <p className="text-xs font-medium text-foreground">Register public URL via Caddy</p>
          <div className="flex gap-2">
            <input
              type="text"
              value={regPath}
              onChange={e => setRegPath(e.target.value)}
              placeholder="/myapp"
              className="flex-1 text-xs px-2 py-1 rounded border border-border bg-background focus:outline-none focus:ring-1 focus:ring-primary"
            />
            <input
              type="number"
              value={regPort}
              onChange={e => setRegPort(e.target.value)}
              placeholder="Port"
              className="w-24 text-xs px-2 py-1 rounded border border-border bg-background focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
          {regError && <p className="text-xs text-destructive">{regError}</p>}
          <div className="flex gap-2">
            <button
              onClick={submitRegister}
              disabled={registering}
              className="text-xs px-3 py-1 rounded bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              {registering ? 'Registering…' : 'Register'}
            </button>
            <button
              onClick={() => setShowRegister(false)}
              className="text-xs px-3 py-1 rounded border border-border hover:bg-muted transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

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

function GitSection({ workspaceName }: { workspaceName: string }) {
  const [gitInfo, setGitInfo] = useState<GitInfo | null>(null);
  const [credInfo, setCredInfo] = useState<GitCredInfo | null>(null);
  const [pushState, setPushState] = useState<'idle' | 'pushing' | 'done' | 'error'>('idle');
  const [pushError, setPushError] = useState<string | null>(null);

  // "Link remote" panel state
  const [showLinkPanel, setShowLinkPanel] = useState(false);
  const [linkUrl, setLinkUrl] = useState('');
  const [linkProvider, setLinkProvider] = useState<GitProvider>('generic');
  const [linkUsername, setLinkUsername] = useState('');
  const [linkToken, setLinkToken] = useState('');
  const [linking, setLinking] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);

  // "Edit auth" panel state (when remote already linked)
  const [showAuthPanel, setShowAuthPanel] = useState(false);
  const [authProvider, setAuthProvider] = useState<GitProvider>('generic');
  const [authUsername, setAuthUsername] = useState('');
  const [authToken, setAuthToken] = useState('');
  const [savingAuth, setSavingAuth] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  const loadGitInfo = useCallback(async () => {
    try {
      const [status, creds] = await Promise.all([
        apiFetch(`/git/${workspaceName}/status`),
        apiFetch(`/git/${workspaceName}/credentials`),
      ]);
      setGitInfo({ branch: status.branch, remoteUrl: status.remoteUrl });
      setCredInfo(creds);
      if (creds.configured && creds.provider) {
        setAuthProvider(creds.provider);
        setAuthUsername(creds.username || '');
      }
    } catch { /* ignore */ }
  }, [workspaceName]);

  useEffect(() => { loadGitInfo(); }, [loadGitInfo]);

  const handleLink = async () => {
    if (!linkUrl.trim() || linking) return;
    setLinking(true);
    setLinkError(null);
    try {
      // Set the remote URL
      await apiFetch(`/git/${workspaceName}/remote`, {
        method: 'POST',
        body: JSON.stringify({ url: linkUrl.trim() }),
      });
      // Save credentials alongside if provided
      if (linkToken.trim()) {
        await apiFetch(`/git/${workspaceName}/credentials`, {
          method: 'POST',
          body: JSON.stringify({ provider: linkProvider, username: linkUsername, token: linkToken }),
        });
      }
      await loadGitInfo();
      setShowLinkPanel(false);
      setLinkUrl('');
      setLinkToken('');
      setLinkUsername('');
    } catch (err: any) {
      setLinkError(err.message || 'Failed to set remote');
    }
    setLinking(false);
  };

  const handlePush = async () => {
    setPushState('pushing');
    setPushError(null);
    try {
      await apiFetch(`/git/${workspaceName}/push`, { method: 'POST' });
      setPushState('done');
      setTimeout(() => setPushState('idle'), 2000);
    } catch (err: any) {
      setPushState('error');
      setPushError(err.message || 'Push failed');
    }
  };

  const handleSaveAuth = async () => {
    if (!authToken.trim() || savingAuth) return;
    setSavingAuth(true);
    setAuthError(null);
    try {
      await apiFetch(`/git/${workspaceName}/credentials`, {
        method: 'POST',
        body: JSON.stringify({ provider: authProvider, username: authUsername, token: authToken }),
      });
      setAuthToken('');
      setShowAuthPanel(false);
      await loadGitInfo();
    } catch (err: any) {
      setAuthError(err.message || 'Failed to save credentials');
    }
    setSavingAuth(false);
  };

  const handleRemoveAuth = async () => {
    try {
      await apiFetch(`/git/${workspaceName}/credentials`, { method: 'DELETE' });
      setCredInfo({ configured: false });
      setAuthUsername('');
      setAuthToken('');
    } catch { /* ignore */ }
  };

  if (!gitInfo) return null;

  const remoteUrl = gitInfo.remoteUrl;

  return (
    <div className="mt-2 space-y-1.5">
      {/* Status row */}
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <span className="flex items-center gap-1">
          <GitBranch size={12} />
          {gitInfo.branch || 'unknown'}
        </span>

        {remoteUrl ? (
          <>
            <span className="flex items-center gap-1 truncate max-w-xs" title={remoteUrl}>
              <Link size={12} className="shrink-0" />
              {abbreviateUrl(remoteUrl)}
            </span>
            <button
              onClick={handlePush}
              disabled={pushState === 'pushing'}
              className={`flex items-center gap-1 px-2 py-0.5 rounded-md border transition-colors ${
                pushState === 'done'
                  ? 'border-green-500/40 text-green-600 bg-green-500/10'
                  : pushState === 'error'
                  ? 'border-destructive/40 text-destructive bg-destructive/10'
                  : 'border-border hover:bg-muted hover:text-foreground'
              }`}
            >
              {pushState === 'pushing' ? <RefreshCw size={11} className="animate-spin" /> : <Upload size={11} />}
              {pushState === 'done' ? 'Pushed ✓' : pushState === 'error' ? 'Push failed' : 'Push'}
            </button>
            {pushState === 'error' && pushError && (
              <span className="text-destructive">{pushError}</span>
            )}
            {/* Auth badge */}
            <button
              onClick={() => { setShowAuthPanel(v => !v); setAuthError(null); }}
              className={`flex items-center gap-1 px-2 py-0.5 rounded-md border transition-colors ${
                credInfo?.configured
                  ? 'border-green-500/40 text-green-600 bg-green-500/10 hover:bg-green-500/20'
                  : 'border-border hover:bg-muted hover:text-foreground'
              }`}
              title={credInfo?.configured
                ? `Auth: ${PROVIDER_LABELS[credInfo.provider!]} · ${credInfo.username || 'no username'}`
                : 'Configure authentication'}
            >
              {credInfo?.configured ? <Lock size={11} /> : <LockOpen size={11} />}
              {credInfo?.configured ? PROVIDER_LABELS[credInfo.provider!] : 'Auth'}
            </button>
          </>
        ) : (
          <button
            onClick={() => setShowLinkPanel(v => !v)}
            className={`flex items-center gap-1 px-2 py-0.5 rounded-md border transition-colors ${
              showLinkPanel
                ? 'border-primary/30 bg-primary/5 text-primary'
                : 'border-border hover:bg-muted hover:text-foreground'
            }`}
          >
            <Link size={11} />
            Link Git Remote
          </button>
        )}
      </div>

      {/* Link remote panel — shown when no remote is set yet */}
      {showLinkPanel && !remoteUrl && (
        <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold flex items-center gap-1.5">
              <Link size={12} />
              Link Git Remote
            </span>
            <button
              onClick={() => { setShowLinkPanel(false); setLinkError(null); setLinkUrl(''); setLinkToken(''); }}
              className="text-muted-foreground hover:text-foreground"
            >
              <X size={13} />
            </button>
          </div>

          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Remote URL</label>
            <input
              type="url"
              value={linkUrl}
              onChange={e => setLinkUrl(e.target.value)}
              placeholder="https://github.com/user/repo.git"
              className="w-full text-xs px-2.5 py-1.5 rounded-lg border border-border bg-background focus:outline-none focus:ring-1 focus:ring-primary"
              onKeyDown={e => { if (e.key === 'Enter') handleLink(); if (e.key === 'Escape') setShowLinkPanel(false); }}
              autoFocus
            />
          </div>

          <GitAuthFields
            provider={linkProvider}
            setProvider={setLinkProvider}
            username={linkUsername}
            setUsername={setLinkUsername}
            token={linkToken}
            setToken={setLinkToken}
            urlForDetection={linkUrl}
          />

          {linkError && <p className="text-xs text-destructive">{linkError}</p>}

          <button
            onClick={handleLink}
            disabled={!linkUrl.trim() || linking}
            className="w-full py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors flex items-center justify-center gap-1.5"
          >
            {linking && <RefreshCw size={11} className="animate-spin" />}
            Link Remote
          </button>
        </div>
      )}

      {/* Auth config panel — shown when remote is already set */}
      {showAuthPanel && remoteUrl && (
        <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold flex items-center gap-1.5">
              <KeyRound size={12} />
              Git Authentication
            </span>
            <button onClick={() => { setShowAuthPanel(false); setAuthError(null); }} className="text-muted-foreground hover:text-foreground">
              <X size={13} />
            </button>
          </div>

          {credInfo?.configured && (
            <p className="text-xs text-green-600 flex items-center gap-1">
              <Lock size={11} />
              {PROVIDER_LABELS[credInfo.provider!]} active · username: <span className="font-mono ml-0.5">{credInfo.username || '(not set)'}</span>
            </p>
          )}

          <GitAuthFields
            provider={authProvider}
            setProvider={setAuthProvider}
            username={authUsername}
            setUsername={setAuthUsername}
            token={authToken}
            setToken={setAuthToken}
            urlForDetection={remoteUrl}
          />

          {authError && <p className="text-xs text-destructive">{authError}</p>}

          <div className="flex gap-2">
            <button
              onClick={handleSaveAuth}
              disabled={!authToken.trim() || savingAuth}
              className="flex-1 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors flex items-center justify-center gap-1.5"
            >
              {savingAuth && <RefreshCw size={11} className="animate-spin" />}
              Save Credentials
            </button>
            {credInfo?.configured && (
              <button
                onClick={handleRemoveAuth}
                className="px-3 py-1.5 rounded-lg border border-destructive/30 text-destructive text-xs hover:bg-destructive/10 transition-colors"
              >
                Remove
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function WorkspaceCard({ workspace, onViewSessions, onDeleteWorkspace }: {
  workspace: WorkspaceInfo;
  onViewSessions: (name: string) => void;
  onDeleteWorkspace: (ws: WorkspaceInfo) => void;
}) {
  const [containersOpen, setContainersOpen] = useState(false);
  const [containers, setContainers] = useState<ContainerInfo[]>([]);
  const [apps, setApps] = useState<AppInfo[]>([]);
  const [loadingContainers, setLoadingContainers] = useState(false);
  const [bulkActioning, setBulkActioning] = useState(false);

  const fetchContainers = useCallback(async () => {
    const [c, a] = await Promise.all([
      apiFetch(`/containers?workspace=${encodeURIComponent(workspace.name)}`),
      apiFetch('/apps'),
    ]);
    setContainers(c);
    setApps(a);
  }, [workspace.name]);

  const toggleContainers = useCallback(async () => {
    if (containersOpen) {
      setContainersOpen(false);
      return;
    }
    setLoadingContainers(true);
    try {
      await fetchContainers();
    } catch { /* ignore */ }
    setLoadingContainers(false);
    setContainersOpen(true);
  }, [containersOpen, fetchContainers]);

  const refreshContainers = useCallback(async () => {
    try { await fetchContainers(); } catch { /* ignore */ }
  }, [fetchContainers]);

  const startAll = async () => {
    setBulkActioning(true);
    const stopped = containers.filter(c => c.State !== 'running');
    await Promise.allSettled(stopped.map(c => apiFetch(`/containers/${c.Id}/start`, { method: 'POST' })));
    await refreshContainers();
    setBulkActioning(false);
  };

  const stopAll = async () => {
    setBulkActioning(true);
    const running = containers.filter(c => c.State === 'running');
    await Promise.allSettled(running.map(c => apiFetch(`/containers/${c.Id}/stop`, { method: 'POST' })));
    await refreshContainers();
    setBulkActioning(false);
  };

  const appByContainer = (id: string) => apps.find(a => a.container_id === id);

  const lastActive = workspace.lastActivityAt
    ? new Date(workspace.lastActivityAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
    : null;

  const hasActivity = workspace.runningContainerCount > 0 || workspace.sessionCount > 0;
  const hasRunning = containers.some(c => c.State === 'running');
  const hasStopped = containers.some(c => c.State !== 'running');

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
          <div className="flex items-center gap-2 shrink-0">
            {workspace.totalCostUsd != null && (
              <span className="text-sm font-mono text-muted-foreground">${workspace.totalCostUsd.toFixed(4)}</span>
            )}
            <button
              onClick={() => onDeleteWorkspace(workspace)}
              title="Delete workspace"
              className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
            >
              <Trash2 size={14} />
            </button>
          </div>
        </div>

        <div className="mt-2 flex items-center gap-4 text-sm text-muted-foreground">
          <span>{workspace.sessionCount} session{workspace.sessionCount !== 1 ? 's' : ''}</span>
          <span>{workspace.runningContainerCount} container{workspace.runningContainerCount !== 1 ? 's' : ''} running</span>
          {lastActive && <span>Last active {lastActive}</span>}
        </div>

        <GitSection workspaceName={workspace.name} />

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
          {containers.length > 0 && (
            <div className="flex items-center gap-2 pb-1">
              {hasStopped && (
                <button
                  onClick={startAll}
                  disabled={bulkActioning}
                  className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-lg bg-green-500/10 text-green-600 hover:bg-green-500/20 transition-colors disabled:opacity-50"
                >
                  <Play size={11} />
                  Start All
                </button>
              )}
              {hasRunning && (
                <button
                  onClick={stopAll}
                  disabled={bulkActioning}
                  className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-lg hover:bg-destructive/10 hover:text-destructive text-muted-foreground transition-colors disabled:opacity-50"
                >
                  <Square size={11} />
                  Stop All
                </button>
              )}
              {bulkActioning && <RefreshCw size={12} className="animate-spin text-muted-foreground" />}
            </div>
          )}
          {containers.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-2">No containers found for this workspace.</p>
          ) : (
            containers.map(c => (
              <ContainerRow
                key={c.Id}
                container={c}
                app={appByContainer(c.Id)}
                workspaceName={workspace.name}
                onAction={refreshContainers}
                onRegistered={refreshContainers}
              />
            ))
          )}
        </div>
      )}
    </div>
  );
}

function CreateWorkspacePanel({
  onClose,
  onCreateWorkspace,
}: {
  onClose: () => void;
  onCreateWorkspace: (name: string, opts?: { cloneUrl?: string; remoteUrl?: string; gitProvider?: string; gitUsername?: string; gitToken?: string }) => Promise<void>;
}) {
  const [tab, setTab] = useState<'new' | 'clone'>('new');

  // New repo fields
  const [name, setName] = useState('');
  const [remoteUrl, setRemoteUrl] = useState('');

  // Clone fields
  const [cloneUrl, setCloneUrl] = useState('');
  const [cloneName, setCloneName] = useState('');

  // Shared auth fields
  const [showAuth, setShowAuth] = useState(false);
  const [authProvider, setAuthProvider] = useState<GitProvider>('generic');
  const [authUsername, setAuthUsername] = useState('');
  const [authToken, setAuthToken] = useState('');

  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => { nameRef.current?.focus(); }, []);

  const activeUrl = tab === 'new' ? remoteUrl : cloneUrl;

  const deriveNameFromUrl = (url: string) => {
    const derived = url.split('/').pop()?.replace(/\.git$/, '') ?? '';
    setCloneName(derived);
  };

  const buildAuthOpts = () =>
    authToken.trim()
      ? { gitProvider: authProvider, gitUsername: authUsername, gitToken: authToken }
      : {};

  const handleNew = async () => {
    if (!name.trim() || creating) return;
    setCreating(true);
    setError(null);
    try {
      await onCreateWorkspace(name.trim(), {
        ...(remoteUrl.trim() ? { remoteUrl: remoteUrl.trim() } : {}),
        ...buildAuthOpts(),
      });
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to create workspace');
    }
    setCreating(false);
  };

  const handleClone = async () => {
    if (!cloneUrl.trim() || creating) return;
    const finalName = cloneName.trim() || cloneUrl.split('/').pop()?.replace(/\.git$/, '') || 'workspace';
    setCreating(true);
    setError(null);
    try {
      await onCreateWorkspace(finalName, { cloneUrl: cloneUrl.trim(), ...buildAuthOpts() });
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to clone repository');
    }
    setCreating(false);
  };

  return (
    <div className="rounded-xl border border-primary/30 bg-background overflow-hidden shadow-lg">
      <div className="flex items-center justify-between px-5 py-3 border-b border-border bg-muted/40">
        <span className="text-sm font-semibold">New Workspace</span>
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
          <X size={16} />
        </button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-border">
        {(['new', 'clone'] as const).map(t => (
          <button
            key={t}
            onClick={() => { setTab(t); setError(null); }}
            className={`flex-1 py-2 text-sm font-medium transition-colors ${
              tab === t ? 'border-b-2 border-primary text-foreground' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {t === 'new' ? 'New Repo' : 'Clone Repo'}
          </button>
        ))}
      </div>

      <div className="p-4 space-y-3">
        {tab === 'new' ? (
          <>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Workspace name</label>
              <input
                ref={nameRef}
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="my-project"
                className="w-full text-sm px-3 py-2 rounded-lg border border-border bg-muted focus:outline-none focus:ring-1 focus:ring-primary font-mono"
                onKeyDown={e => { if (e.key === 'Enter') handleNew(); if (e.key === 'Escape') onClose(); }}
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Remote URL (optional)</label>
              <input
                type="url"
                value={remoteUrl}
                onChange={e => setRemoteUrl(e.target.value)}
                placeholder="https://github.com/user/repo.git — link after creation"
                className="w-full text-sm px-3 py-2 rounded-lg border border-border bg-muted focus:outline-none focus:ring-1 focus:ring-primary"
                onKeyDown={e => { if (e.key === 'Enter') handleNew(); if (e.key === 'Escape') onClose(); }}
              />
              <p className="text-xs text-muted-foreground mt-1">Leave blank to link later</p>
            </div>
          </>
        ) : (
          <>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Clone URL</label>
              <input
                ref={nameRef}
                type="url"
                value={cloneUrl}
                onChange={e => { setCloneUrl(e.target.value); deriveNameFromUrl(e.target.value); }}
                placeholder="https://github.com/user/repo.git"
                className="w-full text-sm px-3 py-2 rounded-lg border border-border bg-muted focus:outline-none focus:ring-1 focus:ring-primary"
                onKeyDown={e => { if (e.key === 'Enter') handleClone(); if (e.key === 'Escape') onClose(); }}
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Workspace name</label>
              <input
                type="text"
                value={cloneName}
                onChange={e => setCloneName(e.target.value)}
                placeholder="auto-derived from URL"
                className="w-full text-sm px-3 py-2 rounded-lg border border-border bg-muted focus:outline-none focus:ring-1 focus:ring-primary font-mono"
                onKeyDown={e => { if (e.key === 'Enter') handleClone(); if (e.key === 'Escape') onClose(); }}
              />
            </div>
          </>
        )}

        {/* Auth toggle */}
        <button
          onClick={() => setShowAuth(v => !v)}
          className={`flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border transition-colors w-full ${
            showAuth
              ? 'border-primary/30 bg-primary/5 text-primary'
              : 'border-border text-muted-foreground hover:text-foreground hover:bg-muted'
          }`}
        >
          <KeyRound size={12} />
          {authToken.trim() ? 'Auth configured ✓' : 'Add authentication (for private repos)'}
        </button>

        {showAuth && (
          <div className="rounded-lg border border-border bg-muted/30 p-3">
            <GitAuthFields
              provider={authProvider}
              setProvider={setAuthProvider}
              username={authUsername}
              setUsername={setAuthUsername}
              token={authToken}
              setToken={setAuthToken}
              urlForDetection={activeUrl}
            />
          </div>
        )}

        {error && <p className="text-xs text-destructive">{error}</p>}

        <button
          onClick={tab === 'new' ? handleNew : handleClone}
          disabled={creating || (tab === 'new' ? !name.trim() : !cloneUrl.trim())}
          className="w-full py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
        >
          {creating && <RefreshCw size={14} className="animate-spin" />}
          {tab === 'new' ? 'Create Workspace' : 'Clone Repository'}
        </button>
      </div>
    </div>
  );
}

interface DashboardProps {
  workspaces: WorkspaceInfo[];
  onRefresh: () => void;
  onViewSessions: (workspace: string) => void;
  onCreateWorkspace: (name: string, opts?: { cloneUrl?: string; remoteUrl?: string; gitProvider?: string; gitUsername?: string; gitToken?: string }) => Promise<void>;
  onDeleteWorkspace: (name: string) => Promise<void>;
}

export function Dashboard({ workspaces, onRefresh, onViewSessions, onCreateWorkspace, onDeleteWorkspace }: DashboardProps) {
  const [showCreate, setShowCreate] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<WorkspaceInfo | null>(null);
  const [deleting, setDeleting] = useState(false);

  const handleConfirmDelete = async () => {
    if (!deleteTarget || deleting) return;
    setDeleting(true);
    try {
      await onDeleteWorkspace(deleteTarget.name);
    } finally {
      setDeleting(false);
      setDeleteTarget(null);
    }
  };

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-y-auto">
      <div className="px-6 py-4 border-b border-border flex items-center justify-between shrink-0">
        <h2 className="text-base font-semibold">Workspaces</h2>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowCreate(v => !v)}
            className={`flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg border transition-colors font-medium ${
              showCreate
                ? 'bg-primary/10 border-primary/30 text-primary'
                : 'border-border hover:bg-muted text-foreground'
            }`}
          >
            <Plus size={14} />
            New Workspace
          </button>
          <button
            onClick={onRefresh}
            className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground px-3 py-1.5 rounded-lg hover:bg-muted transition-colors"
          >
            <RefreshCw size={14} />
            Refresh
          </button>
        </div>
      </div>

      <div className="flex-1 p-6">
        <div className="max-w-5xl mx-auto space-y-4">
          {showCreate && (
            <CreateWorkspacePanel
              onClose={() => setShowCreate(false)}
              onCreateWorkspace={async (name, opts) => {
                await onCreateWorkspace(name, opts);
                setShowCreate(false);
              }}
            />
          )}

          {workspaces.length === 0 && !showCreate ? (
            <div className="flex items-center justify-center h-40 text-muted-foreground text-sm">
              No workspaces yet. Click "New Workspace" to get started.
            </div>
          ) : (
            workspaces.map(ws => (
              <WorkspaceCard
                key={ws.name}
                workspace={ws}
                onViewSessions={onViewSessions}
                onDeleteWorkspace={setDeleteTarget}
              />
            ))
          )}
        </div>
      </div>

      {/* Delete confirmation modal */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-background rounded-xl border border-border shadow-xl w-full max-w-md mx-4 p-6 space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <Trash2 size={18} className="text-destructive shrink-0" />
                <h3 className="text-base font-semibold">Delete Workspace</h3>
              </div>
              <button
                onClick={() => setDeleteTarget(null)}
                className="text-muted-foreground hover:text-foreground"
              >
                <X size={16} />
              </button>
            </div>

            <p className="text-sm text-muted-foreground">
              Are you sure you want to delete{' '}
              <span className="font-semibold text-foreground font-mono">{deleteTarget.name}</span>?
              This will permanently delete the workspace directory, all sessions, session history, and git credentials.
            </p>

            {deleteTarget.sessionCount > 0 && (
              <p className="text-sm text-amber-600 dark:text-amber-400">
                {deleteTarget.sessionCount} session{deleteTarget.sessionCount !== 1 ? 's' : ''} and their history will be deleted.
              </p>
            )}

            {deleteTarget.runningContainerCount > 0 && (
              <p className="text-sm text-destructive font-medium">
                Warning: {deleteTarget.runningContainerCount} container{deleteTarget.runningContainerCount !== 1 ? 's' : ''} are currently running.
              </p>
            )}

            <div className="flex gap-2 pt-1">
              <button
                onClick={() => setDeleteTarget(null)}
                className="flex-1 py-2 rounded-lg border border-border text-sm font-medium hover:bg-muted transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmDelete}
                disabled={deleting}
                className="flex-1 py-2 rounded-lg bg-destructive text-destructive-foreground text-sm font-medium hover:bg-destructive/90 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
              >
                {deleting && <RefreshCw size={13} className="animate-spin" />}
                Delete Workspace
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
