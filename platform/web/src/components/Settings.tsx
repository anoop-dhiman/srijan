import { useState, useEffect } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Eye, EyeOff, Plus, Trash2, Save, RotateCcw, Shield, Lock, Users as UsersIcon, Copy, Check, Bot, Terminal, DollarSign, GitBranch, Package, ToggleLeft, ToggleRight, Server } from 'lucide-react';
import { apiFetch, getClaudeOAuthStatus, connectClaudeOAuth, disconnectClaudeOAuth, getRoles, createRole, deleteRole, type AgentRole } from '../lib/api';
import { usePushNotifications } from '../hooks/usePushNotifications';

interface PluginEntry {
  id: string;
  version: string;
  scope: string;
  enabled: boolean;
  installPath: string;
  installedAt: string;
}

interface SettingsProps {
  open: boolean;
  onClose: () => void;
  isAdmin?: boolean;
}

interface Secret {
  id: string;
  name: string;
  created_at: string;
}

interface User {
  id: string;
  username: string;
  role: string;
  createdAt: string;
}

type SettingsSection = 'ai-provider' | 'agent' | 'git' | 'security' | 'secrets' | 'users' | 'spending' | 'plugins' | 'roles' | 'mcp';

export function Settings({ open, isAdmin = false }: SettingsProps) {
  const [provider, setProvider] = useState<'anthropic' | 'vertex' | 'litellm' | 'claude-oauth'>('anthropic');
  const [apiKey, setApiKey] = useState('');
  const [model, setModel] = useState('claude-sonnet-4-6');
  const [litellmBaseUrl, setLitellmBaseUrl] = useState('');
  const [litellmApiKey, setLitellmApiKey] = useState('');
  const [litellmModel, setLitellmModel] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [vertexProjectId, setVertexProjectId] = useState('');
  const [vertexRegion, setVertexRegion] = useState('global');
  const [vertexCredentials, setVertexCredentials] = useState('');
  const [showVertexCreds, setShowVertexCreds] = useState(false);
  const [secrets, setSecrets] = useState<Secret[]>([]);
  const [newSecretName, setNewSecretName] = useState('');
  const [newSecretValue, setNewSecretValue] = useState('');
  const [systemPrompt, setSystemPrompt] = useState('');
  const [defaultSystemPrompt, setDefaultSystemPrompt] = useState('');
  const [defaultBlocklist, setDefaultBlocklist] = useState('');
  const [agentMode, setAgentMode] = useState<'auto' | 'confirm'>('auto');
  const [blocklist, setBlocklist] = useState('');
  const [savingMode, setSavingMode] = useState(false);
  const [modeMessage, setModeMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const [savingPrompt, setSavingPrompt] = useState(false);
  const [message, setMessage] = useState('');
  const [promptMessage, setPromptMessage] = useState('');

  // Agent SDK state
  const [agentSdk, setAgentSdk] = useState<'claude-code' | 'opencode'>('claude-code');
  const [savingSdk, setSavingSdk] = useState(false);
  const [sdkMessage, setSdkMessage] = useState('');

  // TOTP state
  const [totpEnabled, setTotpEnabled] = useState(false);
  const [totpSetupSecret, setTotpSetupSecret] = useState<string | null>(null);
  const [totpSetupUri, setTotpSetupUri] = useState<string | null>(null);
  const [totpCode, setTotpCode] = useState('');
  const [totpMessage, setTotpMessage] = useState('');
  const [totpLoading, setTotpLoading] = useState(false);
  const [totpCopied, setTotpCopied] = useState(false);
  const [totpSecretVisible, setTotpSecretVisible] = useState(false);

  // Users state
  const [users, setUsers] = useState<User[]>([]);
  const [newUserName, setNewUserName] = useState('');
  const [newUserPassword, setNewUserPassword] = useState('');
  const [newUserRole, setNewUserRole] = useState<'admin' | 'user'>('user');
  const [usersMessage, setUsersMessage] = useState('');
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [activeSection, setActiveSection] = useState<SettingsSection>('ai-provider');

  // Git identity state
  const [gitName, setGitName] = useState('');
  const [gitEmail, setGitEmail] = useState('');
  const [savingGit, setSavingGit] = useState(false);
  const [gitMessage, setGitMessage] = useState('');

  // Spending state
  interface SpendingUser { id: string; username: string; spent_usd: number; limit_usd: number | null; percent: number | null; }
  interface SpendingWorkspace { workspace_name: string; spent_usd: number; limit_usd: number | null; percent: number | null; }
  const [spendingUsers, setSpendingUsers] = useState<SpendingUser[]>([]);
  const [spendingWorkspaces, setSpendingWorkspaces] = useState<SpendingWorkspace[]>([]);
  const [spendingUserLimits, setSpendingUserLimits] = useState<Record<string, string>>({});
  const [spendingWsLimits, setSpendingWsLimits] = useState<Record<string, string>>({});
  const [spendingMessage, setSpendingMessage] = useState('');

  // Claude OAuth state
  const [oauthStatus, setOauthStatus] = useState<{ connected: boolean; email?: string; subscriptionType?: string; expiresAt?: number } | null>(null);
  const [oauthToken, setOauthToken] = useState('');
  const [oauthConnecting, setOauthConnecting] = useState(false);
  const [oauthMessage, setOauthMessage] = useState('');

  // Plugins state (admin only)
  const [plugins, setPlugins] = useState<PluginEntry[]>([]);
  const [pluginsLoading, setPluginsLoading] = useState(false);
  const [newPluginId, setNewPluginId] = useState('');
  const [pluginInstalling, setPluginInstalling] = useState(false);
  const [pluginRefreshing, setPluginRefreshing] = useState(false);
  const [pluginMessage, setPluginMessage] = useState('');

  // Roles state
  const [roles, setRoles] = useState<AgentRole[]>([]);
  const [rolesLoaded, setRolesLoaded] = useState(false);
  const [newRoleName, setNewRoleName] = useState('');
  const [newRoleDisplayName, setNewRoleDisplayName] = useState('');
  const [newRoleDescription, setNewRoleDescription] = useState('');
  const [newRolePrompt, setNewRolePrompt] = useState('');
  const [newRoleTools, setNewRoleTools] = useState('');
  const [roleMessage, setRoleMessage] = useState('');

  // MCP state
  interface McpServer {
    name: string;
    command: string;
    args?: string[];
    type?: string;
  }
  const [mcpServers, setMcpServers] = useState<McpServer[]>([]);
  const [mcpLoading, setMcpLoading] = useState(false);
  const [mcpError, setMcpError] = useState('');
  const [newMcpName, setNewMcpName] = useState('');
  const [newMcpCommand, setNewMcpCommand] = useState('');
  const [newMcpArgs, setNewMcpArgs] = useState('');
  const [addingMcp, setAddingMcp] = useState(false);
  const [mcpAddMessage, setMcpAddMessage] = useState('');

  // Push notifications
  const { supported: pushSupported, enabled: pushEnabled, loading: pushLoading, enable: pushEnable, disable: pushDisable, error: pushError } = usePushNotifications();

  useEffect(() => {
    if (!open) return;
    loadConfig();
    loadSecrets();
    loadTotpStatus();
    if (isAdmin) loadUsers();
  }, [open, isAdmin]);

  useEffect(() => {
    if (open && isAdmin && activeSection === 'spending') loadSpending();
    if (open && isAdmin && activeSection === 'plugins') loadPlugins();
  }, [open, isAdmin, activeSection]);

  useEffect(() => {
    if (activeSection === 'roles' && !rolesLoaded) {
      getRoles().then(r => { setRoles(r); setRolesLoaded(true); }).catch(() => {});
    }
  }, [activeSection, rolesLoaded]);

  useEffect(() => {
    if (activeSection !== 'mcp') return;
    setMcpLoading(true);
    apiFetch('/mcp')
      .then((data: { servers: McpServer[] }) => setMcpServers(data.servers || []))
      .catch(() => setMcpError('Failed to load MCP servers'))
      .finally(() => setMcpLoading(false));
  }, [activeSection]);

  useEffect(() => {
    getClaudeOAuthStatus().then(setOauthStatus).catch(() => {});
  }, []);

  const loadConfig = async () => {
    try {
      const config = await apiFetch('/config');
      if (config.llm) {
        setProvider(config.llm.provider || 'anthropic');
        setApiKey(config.llm.apiKey || '');
        setModel(config.llm.model || 'claude-sonnet-4-6');
        setVertexProjectId(config.llm.vertexProjectId || '');
        setVertexRegion(config.llm.vertexRegion || 'global');
        setVertexCredentials(config.llm.vertexCredentials || '');
        setLitellmBaseUrl(config.llm.litellmBaseUrl || '');
        setLitellmApiKey(config.llm.litellmApiKey || '');
        setLitellmModel(config.llm.litellmModel || '');
      }
      setSystemPrompt(config.system_prompt || '');
      setDefaultSystemPrompt(config.default_system_prompt || '');
      if (config.agentMode) setAgentMode(config.agentMode === 'confirm' ? 'confirm' : 'auto');
      // Auto-reset opencode to claude-code since it's not yet available
      if (config.agentSdk && config.agentSdk !== 'opencode') {
        setAgentSdk('claude-code');
      } else {
        setAgentSdk('claude-code');
      }
      const defaults: string[] = config.default_agent_boundaries || [];
      setDefaultBlocklist(defaults.join('\n'));
      if (config.agent_boundaries) {
        try { setBlocklist(JSON.parse(config.agent_boundaries).join('\n')); } catch { /* ignore */ }
      }
      if (config.git_identity) {
        setGitName(config.git_identity.name || '');
        setGitEmail(config.git_identity.email || '');
      }
    } catch {
      // Config might not exist yet
    }
  };

  const loadTotpStatus = async () => {
    try {
      const data = await apiFetch('/auth/totp/status');
      setTotpEnabled(data.enabled);
    } catch { /* ignore */ }
  };

  const loadUsers = async () => {
    try {
      const data = await apiFetch('/users');
      setUsers(data);
      // Identify current user from /auth/me
      const me = await apiFetch('/auth/me');
      setCurrentUserId(me.user?.userId || null);
    } catch { /* ignore */ }
  };

  const loadPlugins = async () => {
    setPluginsLoading(true);
    setPluginMessage('');
    try {
      const data = await apiFetch('/plugins');
      setPlugins(Array.isArray(data) ? data : []);
    } catch (err: unknown) {
      setPlugins([]);
      setPluginMessage((err as Error).message || 'Failed to load plugins');
    } finally {
      setPluginsLoading(false);
    }
  };

  const loadSpending = async () => {
    try {
      const [usersData, wsData] = await Promise.all([
        apiFetch('/spending/users'),
        apiFetch('/spending/workspaces'),
      ]);
      setSpendingUsers(usersData);
      setSpendingWorkspaces(wsData);
      const userLimits: Record<string, string> = {};
      for (const u of usersData) {
        userLimits[u.id] = u.limit_usd != null ? String(u.limit_usd) : '';
      }
      setSpendingUserLimits(userLimits);
      const wsLimits: Record<string, string> = {};
      for (const w of wsData) {
        wsLimits[w.workspace_name] = w.limit_usd != null ? String(w.limit_usd) : '';
      }
      setSpendingWsLimits(wsLimits);
    } catch { /* ignore */ }
  };

  const saveUserSpendingLimit = async (userId: string) => {
    const raw = spendingUserLimits[userId];
    const limit = raw === '' ? null : parseFloat(raw);
    if (limit !== null && (isNaN(limit) || limit < 0)) {
      setSpendingMessage('Invalid limit value');
      return;
    }
    try {
      await apiFetch(`/users/${userId}/spending-limit`, {
        method: 'PUT',
        body: JSON.stringify({ spending_limit_usd: limit }),
      });
      setSpendingMessage('Limit saved');
      setTimeout(() => setSpendingMessage(''), 2000);
      loadSpending();
    } catch (err: unknown) {
      setSpendingMessage((err as Error).message);
    }
  };

  const saveWsSpendingLimit = async (workspaceName: string) => {
    const raw = spendingWsLimits[workspaceName];
    const limit = raw === '' ? null : parseFloat(raw);
    if (limit !== null && (isNaN(limit) || limit < 0)) {
      setSpendingMessage('Invalid limit value');
      return;
    }
    try {
      await apiFetch(`/workspaces/${workspaceName}/spending-limit`, {
        method: 'PUT',
        body: JSON.stringify({ spending_limit_usd: limit }),
      });
      setSpendingMessage('Limit saved');
      setTimeout(() => setSpendingMessage(''), 2000);
      loadSpending();
    } catch (err: unknown) {
      setSpendingMessage((err as Error).message);
    }
  };

  const saveSecuritySettings = async () => {
    setSavingMode(true);
    setModeMessage('');
    try {
      await apiFetch('/config/agentMode', {
        method: 'PUT',
        body: JSON.stringify({ value: agentMode }),
      });
      const lines = blocklist.split('\n').map((l) => l.trim()).filter(Boolean);
      await apiFetch('/config/agent_boundaries', {
        method: 'PUT',
        body: JSON.stringify({ value: lines }),
      });
      setModeMessage('Security settings saved');
      setTimeout(() => setModeMessage(''), 2000);
    } catch (err: unknown) {
      setModeMessage((err as Error).message);
    } finally {
      setSavingMode(false);
    }
  };

  const loadSecrets = async () => {
    try {
      const data = await apiFetch('/secrets');
      setSecrets(data);
    } catch {
      // Ignore
    }
  };

  const saveConfig = async () => {
    setSaving(true);
    setMessage('');
    try {
      await apiFetch('/config/llm', {
        method: 'PUT',
        body: JSON.stringify({ value: { provider, apiKey, model, vertexProjectId, vertexRegion, vertexCredentials, litellmBaseUrl, litellmApiKey, litellmModel } }),
      });
      setMessage('Settings saved');
      setTimeout(() => setMessage(''), 2000);
    } catch (err: unknown) {
      setMessage((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const saveSdkSettings = async () => {
    setSavingSdk(true);
    setSdkMessage('');
    try {
      await apiFetch('/config/agentSdk', {
        method: 'PUT',
        body: JSON.stringify({ value: agentSdk }),
      });
      setSdkMessage('SDK saved');
      setTimeout(() => setSdkMessage(''), 2000);
    } catch (err: unknown) {
      setSdkMessage((err as Error).message);
    } finally {
      setSavingSdk(false);
    }
  };

  const saveSystemPrompt = async () => {
    setSavingPrompt(true);
    setPromptMessage('');
    try {
      await apiFetch('/config/system_prompt', {
        method: 'PUT',
        body: JSON.stringify({ value: systemPrompt }),
      });
      setPromptMessage('System prompt saved');
      setTimeout(() => setPromptMessage(''), 2000);
    } catch (err: unknown) {
      setPromptMessage((err as Error).message);
    } finally {
      setSavingPrompt(false);
    }
  };

  const addSecret = async () => {
    if (!newSecretName || !newSecretValue) return;
    try {
      await apiFetch('/secrets', {
        method: 'POST',
        body: JSON.stringify({ name: newSecretName, value: newSecretValue }),
      });
      setNewSecretName('');
      setNewSecretValue('');
      loadSecrets();
    } catch (err: unknown) {
      setMessage((err as Error).message);
    }
  };

  const deleteSecret = async (id: string) => {
    try {
      await apiFetch(`/secrets/${id}`, { method: 'DELETE' });
      loadSecrets();
    } catch (err: unknown) {
      setMessage((err as Error).message);
    }
  };

  // TOTP handlers
  const handleSetup2FA = async () => {
    setTotpLoading(true);
    setTotpMessage('');
    try {
      const data = await apiFetch('/auth/totp/setup', { method: 'POST' });
      setTotpSetupSecret(data.secret);
      setTotpSetupUri(data.uri);
      setTotpCode('');
    } catch (err: unknown) {
      setTotpMessage((err as Error).message);
    } finally {
      setTotpLoading(false);
    }
  };

  const handleEnable2FA = async () => {
    if (!totpSetupSecret || !totpCode) return;
    setTotpLoading(true);
    setTotpMessage('');
    try {
      await apiFetch('/auth/totp/enable', {
        method: 'POST',
        body: JSON.stringify({ secret: totpSetupSecret, code: totpCode }),
      });
      setTotpEnabled(true);
      setTotpSetupSecret(null);
      setTotpSetupUri(null);
      setTotpCode('');
      setTotpMessage('2FA enabled successfully');
      setTimeout(() => setTotpMessage(''), 3000);
    } catch (err: unknown) {
      setTotpMessage((err as Error).message);
    } finally {
      setTotpLoading(false);
    }
  };

  const handleDisable2FA = async () => {
    if (!totpCode) return;
    setTotpLoading(true);
    setTotpMessage('');
    try {
      await apiFetch('/auth/totp/disable', {
        method: 'POST',
        body: JSON.stringify({ code: totpCode }),
      });
      setTotpEnabled(false);
      setTotpCode('');
      setTotpMessage('2FA disabled');
      setTimeout(() => setTotpMessage(''), 3000);
    } catch (err: unknown) {
      setTotpMessage((err as Error).message);
    } finally {
      setTotpLoading(false);
    }
  };

  const copyToClipboard = async (text: string) => {
    await navigator.clipboard.writeText(text);
    setTotpCopied(true);
    setTimeout(() => setTotpCopied(false), 2000);
  };

  // Users handlers
  const handleAddUser = async () => {
    if (!newUserName || !newUserPassword) return;
    try {
      await apiFetch('/users', {
        method: 'POST',
        body: JSON.stringify({ username: newUserName, password: newUserPassword, role: newUserRole }),
      });
      setNewUserName('');
      setNewUserPassword('');
      setNewUserRole('user');
      setUsersMessage('User created');
      setTimeout(() => setUsersMessage(''), 2000);
      loadUsers();
    } catch (err: unknown) {
      setUsersMessage((err as Error).message);
    }
  };

  const handleDeleteUser = async (id: string) => {
    try {
      await apiFetch(`/users/${id}`, { method: 'DELETE' });
      setUsersMessage('User deleted');
      setTimeout(() => setUsersMessage(''), 2000);
      loadUsers();
    } catch (err: unknown) {
      setUsersMessage((err as Error).message);
    }
  };

  const handleOAuthConnect = async () => {
    if (!oauthToken.trim()) return;
    setOauthConnecting(true);
    setOauthMessage('');
    try {
      await connectClaudeOAuth(oauthToken.trim());
      setOauthToken('');
      const status = await getClaudeOAuthStatus();
      setOauthStatus(status);
      setOauthMessage('Claude account connected successfully.');
    } catch (e) {
      setOauthMessage(e instanceof Error ? e.message : 'Failed to connect.');
    } finally {
      setOauthConnecting(false);
    }
  };

  const handleOAuthDisconnect = async () => {
    try {
      await disconnectClaudeOAuth();
      setOauthStatus({ connected: false });
      setOauthMessage('Disconnected.');
    } catch (e) {
      setOauthMessage(e instanceof Error ? e.message : 'Failed to disconnect.');
    }
  };

  if (!open) return null;

  const loadMcpServers = async () => {
    setMcpLoading(true);
    setMcpError('');
    try {
      const data: { servers: McpServer[] } = await apiFetch('/mcp');
      setMcpServers(data.servers || []);
    } catch {
      setMcpError('Failed to load MCP servers');
    } finally {
      setMcpLoading(false);
    }
  };

  const handleAddMcp = async () => {
    if (!newMcpName || !newMcpCommand) return;
    setAddingMcp(true);
    setMcpAddMessage('');
    try {
      await apiFetch('/forge/api/mcp', {
        method: 'POST',
        body: JSON.stringify({ name: newMcpName, command: newMcpCommand, args: newMcpArgs.split(' ').filter(Boolean) }),
      });
      setNewMcpName('');
      setNewMcpCommand('');
      setNewMcpArgs('');
      setMcpAddMessage('Server added');
      setTimeout(() => setMcpAddMessage(''), 2000);
      await loadMcpServers();
    } catch (err: unknown) {
      setMcpAddMessage((err as Error).message || 'Failed to add server');
    } finally {
      setAddingMcp(false);
    }
  };

  const handleRemoveMcp = async (name: string) => {
    try {
      await apiFetch(`/forge/api/mcp/${name}`, { method: 'DELETE' });
      await loadMcpServers();
    } catch (err: unknown) {
      setMcpError((err as Error).message || 'Failed to remove server');
    }
  };

  const navItems: { key: SettingsSection; label: string; icon: React.ReactNode }[] = [
    { key: 'ai-provider', label: 'AI Provider', icon: <Bot size={15} /> },
    { key: 'agent',       label: 'Agent',       icon: <Terminal size={15} /> },
    { key: 'mcp',         label: 'MCP Servers', icon: <Server size={15} /> },
    { key: 'git',         label: 'Git',         icon: <GitBranch size={15} /> },
    { key: 'security',    label: 'Security',    icon: <Lock size={15} /> },
    { key: 'secrets',     label: 'Secrets',     icon: <Shield size={15} /> },
    { key: 'roles',       label: 'Agent Roles', icon: <Bot size={15} /> },
    ...(isAdmin ? [{ key: 'users' as const, label: 'Users', icon: <UsersIcon size={15} /> }] : []),
    ...(isAdmin ? [{ key: 'spending' as const, label: 'Spending', icon: <DollarSign size={15} /> }] : []),
    ...(isAdmin ? [{ key: 'plugins' as const, label: 'Plugins', icon: <Package size={15} /> }] : []),
  ];

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="flex flex-col md:flex-row flex-1 min-h-0">
        {/* Single responsive nav: horizontal scrollable on mobile, vertical sidebar on desktop */}
        <nav className="flex overflow-x-auto border-b border-border shrink-0 md:flex-col md:overflow-x-visible md:border-b-0 md:border-r md:w-48">
          <div className="hidden md:block px-5 py-5 border-b border-border shrink-0">
            <h2 className="font-semibold text-base">Settings</h2>
          </div>
          <div className="flex md:flex-col md:gap-0.5 md:py-3 md:px-2">
          {navItems.map(({ key, label, icon }) => (
            <button
              key={key}
              onClick={() => setActiveSection(key)}
              style={{ touchAction: 'manipulation' }}
              className={`flex items-center gap-1.5 px-4 py-3 text-sm font-medium whitespace-nowrap transition-colors border-b-2 md:border-b-0 md:w-full md:rounded-lg md:px-3 md:py-2 md:gap-2.5 md:text-left ${
                activeSection === key
                  ? 'border-primary text-primary md:border-transparent md:bg-muted md:text-foreground'
                  : 'border-transparent text-muted-foreground hover:text-foreground md:hover:bg-muted/50'
              }`}
            >
              {icon}
              {label}
            </button>
          ))}
          </div>
        </nav>

        {/* Right content panel */}
        <div className="flex-1 w-full overflow-y-auto py-4 md:py-6 px-4 md:px-6">
          <div className="max-w-5xl mx-auto space-y-6">

        {/* AI Provider section */}
        {activeSection === 'ai-provider' && <>
          <section className="space-y-4">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">LLM Provider</h3>
            {/* Provider toggle */}
            <div className="flex rounded-xl border border-border bg-muted p-1 gap-1">
              <button
                type="button"
                onClick={() => setProvider('anthropic')}
                className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                  provider === 'anthropic'
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-background hover:text-foreground'
                }`}
              >
                Anthropic API
              </button>
              <button
                type="button"
                onClick={() => setProvider('vertex')}
                className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                  provider === 'vertex'
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-background hover:text-foreground'
                }`}
              >
                Vertex AI (GCP)
              </button>
              <button
                type="button"
                onClick={() => setProvider('litellm')}
                className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                  provider === 'litellm'
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-background hover:text-foreground'
                }`}
              >
                LiteLLM Proxy
              </button>
              <button
                type="button"
                onClick={() => setProvider('claude-oauth')}
                className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                  provider === 'claude-oauth'
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-background hover:text-foreground'
                }`}
              >
                Claude Account (OAuth)
              </button>
            </div>

            {provider === 'anthropic' && (
              <div className="space-y-1.5">
                <label className="text-sm font-medium">API Key</label>
                <div className="relative">
                  <input
                    type={showKey ? 'text' : 'password'}
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    placeholder="sk-ant-..."
                    className="w-full rounded-xl border border-border bg-muted px-4 py-3 pr-11 text-base focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                  <button
                    type="button"
                    onClick={() => setShowKey(!showKey)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {showKey ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>
            )}

            {provider === 'vertex' && (
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Project ID</label>
                  <input
                    type="text"
                    value={vertexProjectId}
                    onChange={(e) => setVertexProjectId(e.target.value)}
                    placeholder="my-gcp-project"
                    className="w-full rounded-xl border border-border bg-muted px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Region</label>
                  <input
                    type="text"
                    value={vertexRegion}
                    onChange={(e) => setVertexRegion(e.target.value)}
                    placeholder="global"
                    className="w-full rounded-xl border border-border bg-muted px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Service Account Key <span className="text-muted-foreground font-normal">(optional)</span></label>
                  <div className="relative">
                    <textarea
                      rows={4}
                      value={showVertexCreds ? vertexCredentials : (vertexCredentials ? '•'.repeat(Math.min(vertexCredentials.length, 40)) : '')}
                      onChange={(e) => setVertexCredentials(e.target.value)}
                      onFocus={() => setShowVertexCreds(true)}
                      placeholder='Paste service account JSON here, or leave blank to use gcloud ADC'
                      className="w-full rounded-xl border border-border bg-muted px-4 py-3 pr-11 font-mono text-xs focus:outline-none focus:ring-2 focus:ring-primary resize-none"
                    />
                    <button
                      type="button"
                      onClick={() => setShowVertexCreds(!showVertexCreds)}
                      className="absolute right-3 top-3 p-1 text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {showVertexCreds ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Leave blank to use Application Default Credentials (<code className="font-mono">gcloud auth application-default login</code>)
                  </p>
                </div>
              </div>
            )}

            {provider === 'litellm' && (
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Proxy Base URL</label>
                  <input
                    type="text"
                    value={litellmBaseUrl}
                    onChange={(e) => setLitellmBaseUrl(e.target.value)}
                    placeholder="http://localhost:4000"
                    className="w-full rounded-xl border border-border bg-muted px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">API Key <span className="text-muted-foreground font-normal">(optional)</span></label>
                  <input
                    type="password"
                    value={litellmApiKey}
                    onChange={(e) => setLitellmApiKey(e.target.value)}
                    placeholder="Proxy master key"
                    className="w-full rounded-xl border border-border bg-muted px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Model Name</label>
                  <input
                    type="text"
                    value={litellmModel}
                    onChange={(e) => setLitellmModel(e.target.value)}
                    placeholder="gpt-4o, ollama/llama3, bedrock/claude-3-5-sonnet"
                    className="w-full rounded-xl border border-border bg-muted px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>
                <div className="rounded-xl border border-border bg-muted/30 px-4 py-3 text-xs text-muted-foreground">
                  Run your own LiteLLM proxy to route requests to any model provider. See the LiteLLM documentation for setup instructions.
                </div>
              </div>
            )}

            {provider === 'claude-oauth' && (
              <div className="space-y-3 rounded-lg border border-border p-4">
                <div className="text-sm font-medium">Claude Account</div>
                {oauthStatus?.connected ? (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-sm text-green-600 dark:text-green-400">
                      <span>Connected: {oauthStatus.email}</span>
                      {oauthStatus.subscriptionType && <span className="text-xs text-muted-foreground">({oauthStatus.subscriptionType})</span>}
                    </div>
                    {oauthStatus.expiresAt && (
                      <div className="text-xs text-muted-foreground">
                        Expires: {new Date(oauthStatus.expiresAt).toLocaleString()}
                      </div>
                    )}
                    <button onClick={handleOAuthDisconnect} className="text-sm text-destructive hover:underline">
                      Disconnect
                    </button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="text-xs text-muted-foreground space-y-1">
                      <p>Connect using your Claude Pro/Team subscription.</p>
                      <p>1. Open the Terminal tab and run: <code className="font-mono bg-muted px-1 rounded">claude auth login</code></p>
                      <p>2. Complete the browser login flow.</p>
                      <p>3. Run: <code className="font-mono bg-muted px-1 rounded">cat ~/.claude/.credentials.json</code></p>
                      <p>4. Copy the <code className="font-mono bg-muted px-1 rounded">accessToken</code> value and paste it below:</p>
                    </div>
                    <div className="flex flex-col sm:flex-row gap-2">
                      <input
                        type="password"
                        placeholder="Paste access token..."
                        value={oauthToken}
                        onChange={e => setOauthToken(e.target.value)}
                        className="flex-1 rounded border border-input bg-background px-3 py-1.5 text-sm"
                      />
                      <button
                        onClick={handleOAuthConnect}
                        disabled={oauthConnecting || !oauthToken.trim()}
                        style={{ touchAction: 'manipulation' }}
                        className="rounded bg-primary px-3 py-1.5 text-sm text-primary-foreground disabled:opacity-50"
                      >
                        {oauthConnecting ? 'Connecting...' : 'Connect'}
                      </button>
                    </div>
                  </div>
                )}
                {oauthMessage && <p className="text-sm text-muted-foreground">{oauthMessage}</p>}
              </div>
            )}

            {provider !== 'litellm' && provider !== 'claude-oauth' && (
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Model</label>
              <select
                value={model}
                onChange={(e) => setModel(e.target.value)}
                className="w-full rounded-xl border border-border bg-muted px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-primary"
              >
                <option value="claude-sonnet-4-6">Claude Sonnet 4.6</option>
                <option value="claude-opus-4-6">Claude Opus 4.6</option>
                <option value="claude-haiku-4-5-20251001">Claude Haiku 4.5</option>
              </select>
            </div>
            )}

            <button
              onClick={saveConfig}
              disabled={saving}
              className="flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-base font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
            >
              <Save size={16} />
              {saving ? 'Saving…' : 'Save'}
            </button>

            {message && (
              <p className="text-sm text-secondary-foreground">{message}</p>
            )}
          </section>
        </>}

        {/* Agent section */}
        {activeSection === 'agent' && <>
          <section className="space-y-4">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">Agent System Prompt</h3>
            <textarea
              rows={10}
              value={systemPrompt || defaultSystemPrompt}
              onChange={(e) => setSystemPrompt(e.target.value)}
              className="w-full rounded-xl border border-border bg-muted px-4 py-3 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary resize-y leading-relaxed"
            />

            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2">
              <button
                onClick={saveSystemPrompt}
                disabled={savingPrompt}
                style={{ touchAction: 'manipulation' }}
                className="flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-base font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
              >
                <Save size={16} />
                {savingPrompt ? 'Saving…' : 'Save Prompt'}
              </button>
              <button
                onClick={() => {
                  setSystemPrompt('');
                  setPromptMessage('Reset to default — click Save to apply');
                }}
                style={{ touchAction: 'manipulation' }}
                className="flex items-center gap-2 rounded-xl border border-border px-4 py-2.5 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
              >
                <RotateCcw size={14} />
                Reset to Default
              </button>
            </div>

            {promptMessage && (
              <p className="text-sm text-secondary-foreground">{promptMessage}</p>
            )}
          </section>

          <section className="space-y-4">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">Security</h3>
            <div className="space-y-1.5">
              <div className="flex rounded-xl border border-border bg-muted p-1 gap-1">
                <button
                  type="button"
                  onClick={() => setAgentMode('auto')}
                  className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                    agentMode === 'auto'
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:bg-background hover:text-foreground'
                  }`}
                >
                  Auto (bypass all)
                </button>
                <button
                  type="button"
                  onClick={() => setAgentMode('confirm')}
                  className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                    agentMode === 'confirm'
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:bg-background hover:text-foreground'
                  }`}
                >
                  Confirm (approve each)
                </button>
              </div>
              <p className="text-xs text-muted-foreground">In Confirm mode, the agent will pause and ask for approval before modifying files or running commands.</p>
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium flex items-center gap-1.5">
                <Shield size={14} />
                Command Blocklist
              </label>
              <textarea
                rows={5}
                value={blocklist || defaultBlocklist}
                onChange={(e) => setBlocklist(e.target.value)}
                className="w-full rounded-xl border border-border bg-muted px-4 py-3 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary resize-y"
              />
              <p className="text-xs text-muted-foreground">One pattern per line. Agent will be killed if it runs a Bash command containing any of these. Showing defaults when no custom list is saved.</p>
            </div>

            <button
              onClick={saveSecuritySettings}
              disabled={savingMode}
              className="flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-base font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
            >
              <Save size={16} />
              {savingMode ? 'Saving…' : 'Save Agent Settings'}
            </button>

            {modeMessage && <p className="text-sm text-secondary-foreground">{modeMessage}</p>}
          </section>

          <section className="space-y-4">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">Agent SDK</h3>
            <div className="flex rounded-xl border border-border bg-muted p-1 gap-1">
              <button
                type="button"
                onClick={() => setAgentSdk('claude-code')}
                className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                  agentSdk === 'claude-code'
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-background hover:text-foreground'
                }`}
              >
                Claude Code
              </button>
              <button
                type="button"
                disabled
                className="flex-1 rounded-lg px-3 py-2 text-sm font-medium transition-colors text-muted-foreground opacity-50 cursor-not-allowed flex items-center justify-center gap-1"
              >
                OpenCode
                <span className="text-xs bg-muted text-muted-foreground px-1.5 py-0.5 rounded-full ml-2">Not yet available</span>
              </button>
            </div>
            <p className="text-xs text-muted-foreground">OpenCode support is not yet available. Claude Code is the only supported SDK.</p>
            <button
              onClick={saveSdkSettings}
              disabled={savingSdk}
              className="flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-base font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
            >
              <Save size={16} />
              {savingSdk ? 'Saving…' : 'Save SDK'}
            </button>
            {sdkMessage && <p className="text-sm text-secondary-foreground">{sdkMessage}</p>}
          </section>
        </>}

        {/* Git section */}
        {activeSection === 'git' && <>
          <section className="space-y-4">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">Default Git Identity</h3>
            <p className="text-sm text-muted-foreground">
              Set the default author name and email for git commits. Applied automatically when creating new workspaces. Per-workspace overrides can be configured in the Dashboard.
            </p>
            <div className="space-y-3">
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Author Name</label>
                <input
                  type="text"
                  value={gitName}
                  onChange={(e) => setGitName(e.target.value)}
                  placeholder="Jane Doe"
                  className="w-full rounded-xl border border-border bg-muted px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Author Email</label>
                <input
                  type="email"
                  value={gitEmail}
                  onChange={(e) => setGitEmail(e.target.value)}
                  placeholder="jane@example.com"
                  className="w-full rounded-xl border border-border bg-muted px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
            </div>
            <button
              onClick={async () => {
                setSavingGit(true);
                setGitMessage('');
                try {
                  await apiFetch('/config/git_identity', {
                    method: 'PUT',
                    body: JSON.stringify({ value: { name: gitName, email: gitEmail } }),
                  });
                  setGitMessage('Git identity saved');
                  setTimeout(() => setGitMessage(''), 2000);
                } catch (err: unknown) {
                  setGitMessage((err as Error).message || 'Failed to save');
                } finally {
                  setSavingGit(false);
                }
              }}
              disabled={savingGit}
              className="flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-base font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
            >
              <Save size={16} />
              {savingGit ? 'Saving…' : 'Save Git Identity'}
            </button>
            {gitMessage && <p className="text-sm text-secondary-foreground">{gitMessage}</p>}
          </section>
        </>}

        {/* Security section (2FA + notifications) */}
        {activeSection === 'security' && <>
          <section className="space-y-4">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">Notifications</h3>
            <div className="border border-border rounded-lg p-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-medium text-sm">Desktop Notifications</div>
                  <div className="text-sm text-muted-foreground">
                    Get notified when an agent completes or needs approval
                  </div>
                </div>
                <button
                  onClick={pushEnabled ? pushDisable : pushEnable}
                  disabled={pushLoading || !pushSupported}
                  className="text-primary disabled:opacity-40 transition-colors"
                  aria-label={pushEnabled ? 'Disable notifications' : 'Enable notifications'}
                >
                  {pushEnabled ? <ToggleRight size={28} /> : <ToggleLeft size={28} />}
                </button>
              </div>
              {pushError && <div className="text-sm text-destructive mt-2">{pushError}</div>}
              {!pushSupported && <div className="text-sm text-muted-foreground mt-2">Not supported in this browser</div>}
            </div>
          </section>

          <section className="space-y-4">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">Two-Factor Authentication</h3>
            {totpEnabled ? (
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-green-600 dark:text-green-400 text-sm font-medium">
                  <Lock size={14} />
                  2FA is active
                </div>
                <p className="text-xs text-muted-foreground">Enter your authenticator code to disable 2FA.</p>
                <div className="flex flex-col sm:flex-row gap-2">
                  <input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]{6}"
                    maxLength={6}
                    placeholder="000000"
                    value={totpCode}
                    onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, ''))}
                    className="w-32 rounded-xl border border-border bg-muted px-3 py-2 text-base font-mono text-center focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                  <button
                    onClick={handleDisable2FA}
                    disabled={totpLoading || totpCode.length !== 6}
                    style={{ touchAction: 'manipulation' }}
                    className="flex items-center gap-2 rounded-xl border border-destructive/50 px-4 py-2 text-sm font-medium text-destructive hover:bg-destructive/10 disabled:opacity-50 transition-colors"
                  >
                    Disable 2FA
                  </button>
                </div>
                {totpMessage && <p className="text-sm text-secondary-foreground">{totpMessage}</p>}
              </div>
            ) : (
              <div className="space-y-3">
                {!totpSetupSecret ? (
                  <div className="space-y-2">
                    <p className="text-sm text-muted-foreground">Add an extra layer of security with a time-based one-time password.</p>
                    <button
                      onClick={handleSetup2FA}
                      disabled={totpLoading}
                      className="flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-base font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
                    >
                      <Lock size={16} />
                      Enable 2FA
                    </button>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <p className="text-sm text-muted-foreground">
                      Scan this QR code with your authenticator app (Google Authenticator, Authy, 1Password, etc.):
                    </p>
                    {totpSetupUri && (
                      <div className="inline-block p-3 rounded-xl bg-white">
                        <QRCodeSVG value={totpSetupUri} size={160} />
                      </div>
                    )}
                    <p className="text-xs text-muted-foreground">Or enter this key manually:</p>
                    <div className="flex items-center gap-2">
                      <code className="flex-1 rounded-xl border border-border bg-muted px-4 py-3 text-sm font-mono break-all">
                        {totpSecretVisible ? totpSetupSecret : '••••••••••••••••••••••••••••••••'}
                      </code>
                      <button
                        onClick={() => setTotpSecretVisible(!totpSecretVisible)}
                        className="shrink-0 p-2 rounded-lg border border-border hover:bg-muted transition-colors"
                        title={totpSecretVisible ? 'Hide secret' : 'Show secret'}
                      >
                        {totpSecretVisible ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                      <button
                        onClick={() => copyToClipboard(totpSetupSecret!)}
                        className="shrink-0 p-2 rounded-lg border border-border hover:bg-muted transition-colors"
                        title="Copy secret"
                      >
                        {totpCopied ? <Check size={16} className="text-green-500" /> : <Copy size={16} />}
                      </button>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Then enter the 6-digit code from your app to confirm:
                    </p>
                    <div className="flex flex-col sm:flex-row gap-2">
                      <input
                        type="text"
                        inputMode="numeric"
                        pattern="[0-9]{6}"
                        maxLength={6}
                        placeholder="000000"
                        value={totpCode}
                        onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, ''))}
                        className="w-32 rounded-xl border border-border bg-muted px-3 py-2 text-base font-mono text-center focus:outline-none focus:ring-2 focus:ring-primary"
                      />
                      <button
                        onClick={handleEnable2FA}
                        disabled={totpLoading || totpCode.length !== 6}
                        style={{ touchAction: 'manipulation' }}
                        className="flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
                      >
                        Activate
                      </button>
                      <button
                        onClick={() => { setTotpSetupSecret(null); setTotpSetupUri(null); setTotpCode(''); }}
                        style={{ touchAction: 'manipulation' }}
                        className="flex items-center gap-2 rounded-xl border border-border px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
                {totpMessage && <p className="text-sm text-secondary-foreground">{totpMessage}</p>}
              </div>
            )}
          </section>
        </>}

        {/* Secrets section */}
        {activeSection === 'secrets' && <>
          <section className="space-y-4">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">Secrets</h3>
            <div className="space-y-2">
              {secrets.map((s) => (
                <div
                  key={s.id}
                  className="flex items-center justify-between rounded-xl border border-border px-4 py-3"
                >
                  <span className="text-base font-mono">{s.name}</span>
                  <button
                    onClick={() => deleteSecret(s.id)}
                    className="p-1.5 text-muted-foreground hover:text-destructive transition-colors"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}
            </div>

            {/* Add secret */}
            <div className="rounded-xl border border-border bg-muted/30 p-4 space-y-3">
              <p className="text-sm font-medium text-muted-foreground">Add new secret</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">Name</label>
                  <input
                    type="text"
                    placeholder="Name"
                    value={newSecretName}
                    onChange={(e) => setNewSecretName(e.target.value)}
                    className="w-full rounded-xl border border-border bg-muted px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">Value</label>
                  <input
                    type="password"
                    placeholder="Value"
                    value={newSecretValue}
                    onChange={(e) => setNewSecretValue(e.target.value)}
                    className="w-full rounded-xl border border-border bg-muted px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>
              </div>
              <button
                onClick={addSecret}
                disabled={!newSecretName || !newSecretValue}
                className="flex items-center gap-2 rounded-xl bg-secondary px-4 py-2.5 text-sm font-medium text-secondary-foreground hover:bg-secondary/80 disabled:opacity-50 transition-colors"
              >
                <Plus size={16} />
                Add Secret
              </button>
            </div>
          </section>
        </>}

        {/* Users section — admin only */}
        {activeSection === 'users' && isAdmin && <>
          <section className="space-y-4">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-widest flex items-center gap-1.5">
              <UsersIcon size={13} />
              Users
            </h3>
            <div className="space-y-2">
              {users.map((u) => (
                <div
                  key={u.id}
                  className="flex items-center justify-between rounded-xl border border-border px-4 py-3"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-base font-mono">{u.username}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${
                      u.role === 'admin'
                        ? 'border-primary/40 text-primary bg-primary/10'
                        : 'border-border text-muted-foreground'
                    }`}>
                      {u.role}
                    </span>
                  </div>
                  <button
                    onClick={() => handleDeleteUser(u.id)}
                    disabled={u.id === currentUserId}
                    className="p-1.5 text-muted-foreground hover:text-destructive transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                    title={u.id === currentUserId ? 'Cannot delete own account' : 'Delete user'}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}
            </div>

            {/* Add user form */}
            <div className="rounded-xl border border-border bg-muted/30 p-4 space-y-3">
              <p className="text-sm font-medium text-muted-foreground">Add new user</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">Username</label>
                  <input
                    type="text"
                    placeholder="Username"
                    value={newUserName}
                    onChange={(e) => setNewUserName(e.target.value)}
                    className="w-full rounded-xl border border-border bg-muted px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">Password</label>
                  <input
                    type="password"
                    placeholder="Password"
                    value={newUserPassword}
                    onChange={(e) => setNewUserPassword(e.target.value)}
                    className="w-full rounded-xl border border-border bg-muted px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-medium text-muted-foreground">Role</label>
                  <select
                    value={newUserRole}
                    onChange={(e) => setNewUserRole(e.target.value as 'admin' | 'user')}
                    className="rounded-xl border border-border bg-muted px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  >
                    <option value="user">user</option>
                    <option value="admin">admin</option>
                  </select>
                </div>
                <button
                  onClick={handleAddUser}
                  disabled={!newUserName || !newUserPassword}
                  className="mt-auto flex items-center gap-2 rounded-xl bg-secondary px-4 py-2.5 text-sm font-medium text-secondary-foreground hover:bg-secondary/80 disabled:opacity-50 transition-colors"
                >
                  <Plus size={16} />
                  Add User
                </button>
              </div>
            </div>

            {usersMessage && <p className="text-sm text-secondary-foreground">{usersMessage}</p>}
          </section>
        </>}

        {/* Plugins section — admin only */}
        {activeSection === 'plugins' && isAdmin && <>
          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-widest flex items-center gap-1.5">
                <Package size={13} />
                Claude Code Plugins
              </h3>
              <button
                onClick={async () => {
                  setPluginRefreshing(true);
                  setPluginMessage('');
                  try {
                    await apiFetch('/plugins/marketplace/refresh', { method: 'POST' });
                    setPluginMessage('Marketplace catalog refreshed');
                    setTimeout(() => setPluginMessage(''), 3000);
                  } catch (err: unknown) {
                    setPluginMessage((err as Error).message || 'Refresh failed');
                  } finally {
                    setPluginRefreshing(false);
                  }
                }}
                disabled={pluginRefreshing}
                className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50 transition-colors"
                title="Refresh marketplace catalog from GitHub"
              >
                <RotateCcw size={12} className={pluginRefreshing ? 'animate-spin' : ''} />
                {pluginRefreshing ? 'Refreshing…' : 'Refresh catalog'}
              </button>
            </div>
            <p className="text-sm text-muted-foreground">
              Plugins are installed into the container's Claude home directory and active for every agent session.
            </p>

            {/* Installed plugins list */}
            {pluginsLoading ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : plugins.length === 0 ? (
              <p className="text-sm text-muted-foreground">No plugins installed.</p>
            ) : (
              <div className="space-y-2">
                {plugins.map((p) => (
                  <div key={p.id} className="flex items-center justify-between rounded-xl border border-border px-4 py-3">
                    <div className="flex flex-col gap-0.5 min-w-0">
                      <span className="text-sm font-mono truncate">{p.id}</span>
                      <span className="text-xs text-muted-foreground">v{p.version} · {p.scope}</span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0 ml-3">
                      <button
                        title={p.enabled ? 'Disable plugin' : 'Enable plugin'}
                        onClick={async () => {
                          const action = p.enabled ? 'disable' : 'enable';
                          try {
                            await apiFetch(`/plugins/${encodeURIComponent(p.id)}/${action}`, { method: 'POST' });
                            setPluginMessage(`Plugin ${action}d`);
                            setTimeout(() => setPluginMessage(''), 2000);
                            loadPlugins();
                          } catch (err: unknown) {
                            setPluginMessage((err as Error).message);
                          }
                        }}
                        className={`transition-colors ${p.enabled ? 'text-primary hover:text-primary/70' : 'text-muted-foreground hover:text-foreground'}`}
                      >
                        {p.enabled ? <ToggleRight size={22} /> : <ToggleLeft size={22} />}
                      </button>
                      <button
                        title="Uninstall plugin"
                        onClick={async () => {
                          if (!confirm(`Uninstall ${p.id}?`)) return;
                          try {
                            await apiFetch(`/plugins/${encodeURIComponent(p.id)}`, { method: 'DELETE' });
                            setPluginMessage('Plugin uninstalled');
                            setTimeout(() => setPluginMessage(''), 2000);
                            loadPlugins();
                          } catch (err: unknown) {
                            setPluginMessage((err as Error).message);
                          }
                        }}
                        className="p-1.5 text-muted-foreground hover:text-destructive transition-colors"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Install new plugin */}
            <div className="rounded-xl border border-border bg-muted/30 p-4 space-y-3">
              <p className="text-sm font-medium text-muted-foreground">Install plugin</p>
              <p className="text-xs text-muted-foreground">
                Enter a plugin ID from the official marketplace, e.g. <code className="font-mono bg-muted px-1 rounded">frontend-design@claude-plugins-official</code>
              </p>
              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  type="text"
                  placeholder="plugin-name@marketplace"
                  value={newPluginId}
                  onChange={(e) => setNewPluginId(e.target.value)}
                  className="flex-1 rounded-xl border border-border bg-muted px-3 py-2.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary"
                />
                <button
                  onClick={async () => {
                    if (!newPluginId.trim()) return;
                    setPluginInstalling(true);
                    setPluginMessage('');
                    try {
                      await apiFetch('/plugins', {
                        method: 'POST',
                        body: JSON.stringify({ id: newPluginId.trim() }),
                      });
                      setPluginMessage('Plugin installed');
                      setNewPluginId('');
                      setTimeout(() => setPluginMessage(''), 3000);
                      loadPlugins();
                    } catch (err: unknown) {
                      setPluginMessage((err as Error).message);
                    } finally {
                      setPluginInstalling(false);
                    }
                  }}
                  disabled={!newPluginId.trim() || pluginInstalling}
                  className="flex items-center gap-2 rounded-xl bg-secondary px-4 py-2.5 text-sm font-medium text-secondary-foreground hover:bg-secondary/80 disabled:opacity-50 transition-colors"
                >
                  <Plus size={16} />
                  {pluginInstalling ? 'Installing…' : 'Install'}
                </button>
              </div>
            </div>

            {pluginMessage && <p className="text-sm text-secondary-foreground">{pluginMessage}</p>}
          </section>
        </>}

        {/* Agent Roles section */}
        {activeSection === 'roles' && (
          <div className="space-y-4">
            <div>
              <h3 className="text-sm font-semibold mb-1">Agent Roles</h3>
              <p className="text-xs text-muted-foreground">
                Define specialized agent modes. Use @rolename in chat to activate a role.
              </p>
            </div>

            {/* Role list */}
            <div className="space-y-2">
              {roles.map(role => (
                <div key={role.id} className="flex items-start justify-between rounded-lg border border-border p-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium font-mono">@{role.name}</span>
                      <span className="text-xs text-muted-foreground">{role.display_name}</span>
                      {role.is_default === 1 && (
                        <span className="text-xs bg-muted px-1.5 py-0.5 rounded">default</span>
                      )}
                    </div>
                    {role.description && (
                      <p className="text-xs text-muted-foreground mt-0.5">{role.description}</p>
                    )}
                    {role.allowed_tools && (() => {
                      try {
                        const tools = JSON.parse(role.allowed_tools);
                        return (
                          <p className="text-xs text-muted-foreground/70 mt-0.5">
                            Tools: {tools.join(', ')}
                          </p>
                        );
                      } catch { return null; }
                    })()}
                  </div>
                  {isAdmin && role.is_default === 0 && (
                    <button
                      onClick={async () => {
                        await deleteRole(role.id);
                        setRoles(prev => prev.filter(r => r.id !== role.id));
                      }}
                      className="ml-2 text-destructive hover:underline text-xs shrink-0"
                    >
                      Delete
                    </button>
                  )}
                </div>
              ))}
              {roles.length === 0 && (
                <p className="text-sm text-muted-foreground">No roles defined yet.</p>
              )}
            </div>

            {/* Create new role (admin only) */}
            {isAdmin && (
              <div className="rounded-lg border border-border p-3 space-y-2">
                <div className="text-xs font-semibold">Create New Role</div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <input
                    placeholder="name (e.g. tester)"
                    value={newRoleName}
                    onChange={e => setNewRoleName(e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, ''))}
                    className="rounded border border-input bg-background px-2 py-1.5 text-xs"
                  />
                  <input
                    placeholder="Display Name"
                    value={newRoleDisplayName}
                    onChange={e => setNewRoleDisplayName(e.target.value)}
                    className="rounded border border-input bg-background px-2 py-1.5 text-xs"
                  />
                </div>
                <input
                  placeholder="Description"
                  value={newRoleDescription}
                  onChange={e => setNewRoleDescription(e.target.value)}
                  className="w-full rounded border border-input bg-background px-2 py-1.5 text-xs"
                />
                <textarea
                  placeholder="System prompt addition (optional)"
                  value={newRolePrompt}
                  onChange={e => setNewRolePrompt(e.target.value)}
                  rows={2}
                  className="w-full rounded border border-input bg-background px-2 py-1.5 text-xs font-mono resize-none"
                />
                <input
                  placeholder='Allowed tools JSON, e.g. ["Read","Glob"] or leave blank for all'
                  value={newRoleTools}
                  onChange={e => setNewRoleTools(e.target.value)}
                  className="w-full rounded border border-input bg-background px-2 py-1.5 text-xs font-mono"
                />
                <button
                  onClick={async () => {
                    if (!newRoleName || !newRoleDisplayName) return;
                    try {
                      const created = await createRole({
                        name: newRoleName,
                        display_name: newRoleDisplayName,
                        description: newRoleDescription,
                        system_prompt_addition: newRolePrompt,
                        allowed_tools: newRoleTools.trim() || null,
                      });
                      setRoles(prev => [...prev, created]);
                      setNewRoleName('');
                      setNewRoleDisplayName('');
                      setNewRoleDescription('');
                      setNewRolePrompt('');
                      setNewRoleTools('');
                      setRoleMessage('Role created.');
                    } catch (e: unknown) {
                      setRoleMessage((e as Error).message || 'Failed to create role.');
                    }
                  }}
                  disabled={!newRoleName || !newRoleDisplayName}
                  className="rounded bg-primary px-3 py-1.5 text-xs text-primary-foreground disabled:opacity-50"
                >
                  Create Role
                </button>
                {roleMessage && <p className="text-xs text-muted-foreground">{roleMessage}</p>}
              </div>
            )}
          </div>
        )}

        {/* MCP Servers section */}
        {activeSection === 'mcp' && (
          <div className="space-y-4">
            <h3 className="text-lg font-semibold mb-4">MCP Servers</h3>
            {mcpLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
            {mcpError && <p className="text-sm text-destructive">{mcpError}</p>}

            {/* Servers table */}
            {!mcpLoading && mcpServers.length > 0 && (
              <div className="rounded-xl border border-border overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-muted border-b border-border">
                      <th className="text-left px-4 py-2 font-medium text-muted-foreground">Name</th>
                      <th className="text-left px-4 py-2 font-medium text-muted-foreground">Command</th>
                      <th className="text-left px-4 py-2 font-medium text-muted-foreground">Args</th>
                      <th className="px-4 py-2" />
                    </tr>
                  </thead>
                  <tbody>
                    {mcpServers.map((srv) => (
                      <tr key={srv.name} className="border-b border-border last:border-0">
                        <td className="px-4 py-2 font-mono">{srv.name}</td>
                        <td className="px-4 py-2 font-mono text-muted-foreground">{srv.command}</td>
                        <td className="px-4 py-2 font-mono text-muted-foreground text-xs">{(srv.args || []).join(' ')}</td>
                        <td className="px-4 py-2 text-right">
                          <button
                            onClick={() => handleRemoveMcp(srv.name)}
                            className="p-1.5 text-muted-foreground hover:text-destructive transition-colors"
                            title="Remove server"
                          >
                            <Trash2 size={14} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {!mcpLoading && mcpServers.length === 0 && !mcpError && (
              <p className="text-sm text-muted-foreground">No MCP servers configured.</p>
            )}

            {/* Add server form */}
            <div className="rounded-xl border border-border bg-muted/30 p-4 space-y-3">
              <p className="text-sm font-medium text-muted-foreground">Add MCP server</p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">Name</label>
                  <input
                    type="text"
                    placeholder="my-server"
                    value={newMcpName}
                    onChange={(e) => setNewMcpName(e.target.value)}
                    className="w-full rounded-xl border border-border bg-muted px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">Command</label>
                  <input
                    type="text"
                    placeholder="npx"
                    value={newMcpCommand}
                    onChange={(e) => setNewMcpCommand(e.target.value)}
                    className="w-full rounded-xl border border-border bg-muted px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">Args (space-separated)</label>
                  <input
                    type="text"
                    placeholder="-y @modelcontextprotocol/server-memory"
                    value={newMcpArgs}
                    onChange={(e) => setNewMcpArgs(e.target.value)}
                    className="w-full rounded-xl border border-border bg-muted px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={handleAddMcp}
                  disabled={!newMcpName || !newMcpCommand || addingMcp}
                  className="flex items-center gap-2 rounded-xl bg-secondary px-4 py-2.5 text-sm font-medium text-secondary-foreground hover:bg-secondary/80 disabled:opacity-50 transition-colors"
                >
                  <Plus size={16} />
                  {addingMcp ? 'Adding…' : 'Add Server'}
                </button>
                {mcpAddMessage && <p className="text-sm text-secondary-foreground">{mcpAddMessage}</p>}
              </div>
            </div>
          </div>
        )}

        {/* Spending section — admin only */}
        {activeSection === 'spending' && isAdmin && <>
          <section className="space-y-4">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-widest flex items-center gap-1.5">
              <DollarSign size={13} />
              User Spending Limits (monthly)
            </h3>
            <div className="space-y-2">
              {spendingUsers.map((u) => (
                <div key={u.id} className="flex items-center gap-3 rounded-xl border border-border px-4 py-3">
                  <span className="flex-1 text-sm font-mono">{u.username}</span>
                  <span className="text-xs text-muted-foreground">${u.spent_usd.toFixed(4)} spent</span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="No limit"
                    value={spendingUserLimits[u.id] ?? ''}
                    onChange={(e) => setSpendingUserLimits((prev) => ({ ...prev, [u.id]: e.target.value }))}
                    className="w-28 rounded-lg border border-border bg-muted px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                  <button
                    onClick={() => saveUserSpendingLimit(u.id)}
                    className="flex items-center gap-1 rounded-lg bg-secondary px-3 py-1.5 text-xs font-medium text-secondary-foreground hover:bg-secondary/80 transition-colors"
                  >
                    <Save size={12} />
                    Save
                  </button>
                </div>
              ))}
            </div>
          </section>

          <section className="space-y-4">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-widest flex items-center gap-1.5">
              <DollarSign size={13} />
              Workspace Spending Limits (monthly)
            </h3>
            <div className="space-y-2">
              {spendingWorkspaces.map((w) => (
                <div key={w.workspace_name} className="flex items-center gap-3 rounded-xl border border-border px-4 py-3">
                  <span className="flex-1 text-sm font-mono">{w.workspace_name}</span>
                  <span className="text-xs text-muted-foreground">${w.spent_usd.toFixed(4)} spent</span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="No limit"
                    value={spendingWsLimits[w.workspace_name] ?? ''}
                    onChange={(e) => setSpendingWsLimits((prev) => ({ ...prev, [w.workspace_name]: e.target.value }))}
                    className="w-28 rounded-lg border border-border bg-muted px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                  <button
                    onClick={() => saveWsSpendingLimit(w.workspace_name)}
                    className="flex items-center gap-1 rounded-lg bg-secondary px-3 py-1.5 text-xs font-medium text-secondary-foreground hover:bg-secondary/80 transition-colors"
                  >
                    <Save size={12} />
                    Save
                  </button>
                </div>
              ))}
              {spendingWorkspaces.length === 0 && (
                <p className="text-sm text-muted-foreground">No workspaces yet.</p>
              )}
            </div>
            {spendingMessage && <p className="text-sm text-secondary-foreground">{spendingMessage}</p>}
          </section>
        </>}

          </div>
        </div>
      </div>
    </div>
  );
}

export default Settings;
