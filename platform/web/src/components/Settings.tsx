import { useState, useEffect } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Eye, EyeOff, Plus, Trash2, Save, RotateCcw, Shield, Lock, Users as UsersIcon, Copy, Check, Bot, Terminal, DollarSign, GitBranch } from 'lucide-react';
import { apiFetch } from '../lib/api';

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

type SettingsSection = 'ai-provider' | 'agent' | 'git' | 'security' | 'secrets' | 'users' | 'spending';

export function Settings({ open, isAdmin = false }: SettingsProps) {
  const [provider, setProvider] = useState<'anthropic' | 'vertex' | 'litellm'>('anthropic');
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

  useEffect(() => {
    if (!open) return;
    loadConfig();
    loadSecrets();
    loadTotpStatus();
    if (isAdmin) loadUsers();
  }, [open, isAdmin]);

  useEffect(() => {
    if (open && isAdmin && activeSection === 'spending') loadSpending();
  }, [open, isAdmin, activeSection]);

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

  if (!open) return null;

  const navItems: { key: SettingsSection; label: string; icon: React.ReactNode }[] = [
    { key: 'ai-provider', label: 'AI Provider', icon: <Bot size={15} /> },
    { key: 'agent',       label: 'Agent',       icon: <Terminal size={15} /> },
    { key: 'git',         label: 'Git',         icon: <GitBranch size={15} /> },
    { key: 'security',    label: 'Security',    icon: <Lock size={15} /> },
    { key: 'secrets',     label: 'Secrets',     icon: <Shield size={15} /> },
    ...(isAdmin ? [{ key: 'users' as const, label: 'Users', icon: <UsersIcon size={15} /> }] : []),
    ...(isAdmin ? [{ key: 'spending' as const, label: 'Spending', icon: <DollarSign size={15} /> }] : []),
  ];

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="flex flex-col md:flex-row flex-1 min-h-0">
        {/* Left sidebar nav */}
        <nav className="w-full md:w-48 shrink-0 border-b md:border-b-0 md:border-r border-border flex flex-col">
          <div className="px-5 py-5 border-b border-border shrink-0">
            <h2 className="font-semibold text-base">Settings</h2>
          </div>
          <div className="py-3 flex flex-row md:flex-col overflow-x-auto gap-0.5 px-2">
          {navItems.map(({ key, label, icon }) => (
            <button
              key={key}
              onClick={() => setActiveSection(key)}
              className={`flex items-center gap-2.5 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium text-left transition-colors ${
                activeSection === key
                  ? 'bg-muted text-foreground'
                  : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground'
              }`}
            >
              {icon}
              {label}
            </button>
          ))}
          </div>
        </nav>

        {/* Right content panel */}
        <div className="flex-1 overflow-y-auto py-4 md:py-6 px-4 md:px-6">
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

            {provider !== 'litellm' && (
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

            <div className="flex items-center gap-2">
              <button
                onClick={saveSystemPrompt}
                disabled={savingPrompt}
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

        {/* Security section (2FA only) */}
        {activeSection === 'security' && <>
          <section className="space-y-4">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">Two-Factor Authentication</h3>
            {totpEnabled ? (
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-green-600 dark:text-green-400 text-sm font-medium">
                  <Lock size={14} />
                  2FA is active
                </div>
                <p className="text-xs text-muted-foreground">Enter your authenticator code to disable 2FA.</p>
                <div className="flex gap-2">
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
                    <div className="flex gap-2">
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
                        className="flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
                      >
                        Activate
                      </button>
                      <button
                        onClick={() => { setTotpSetupSecret(null); setTotpSetupUri(null); setTotpCode(''); }}
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
              <div className="grid grid-cols-2 gap-3">
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
              <div className="grid grid-cols-2 gap-3">
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
