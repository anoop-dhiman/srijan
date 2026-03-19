import { useState, useEffect } from 'react';
import { X, Eye, EyeOff, Plus, Trash2, Save, RotateCcw } from 'lucide-react';
import { apiFetch } from '../lib/api';

interface SettingsProps {
  open: boolean;
  onClose: () => void;
}

interface Secret {
  id: string;
  name: string;
  created_at: string;
}

export function Settings({ open, onClose }: SettingsProps) {
  const [provider, setProvider] = useState<'anthropic' | 'vertex'>('anthropic');
  const [apiKey, setApiKey] = useState('');
  const [model, setModel] = useState('claude-sonnet-4-6');
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
  const [saving, setSaving] = useState(false);
  const [savingPrompt, setSavingPrompt] = useState(false);
  const [message, setMessage] = useState('');
  const [promptMessage, setPromptMessage] = useState('');

  useEffect(() => {
    if (!open) return;
    loadConfig();
    loadSecrets();
  }, [open]);

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
      }
      setSystemPrompt(config.system_prompt || '');
      setDefaultSystemPrompt(config.default_system_prompt || '');
    } catch {
      // Config might not exist yet
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
        body: JSON.stringify({ value: { provider, apiKey, model, vertexProjectId, vertexRegion, vertexCredentials } }),
      });
      setMessage('Settings saved');
      setTimeout(() => setMessage(''), 2000);
    } catch (err: any) {
      setMessage(err.message);
    } finally {
      setSaving(false);
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
    } catch (err: any) {
      setPromptMessage(err.message);
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
    } catch (err: any) {
      setMessage(err.message);
    }
  };

  const deleteSecret = async (id: string) => {
    try {
      await apiFetch(`/secrets/${id}`, { method: 'DELETE' });
      loadSecrets();
    } catch (err: any) {
      setMessage(err.message);
    }
  };

  if (!open) return null;

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
        <h2 className="font-semibold text-lg">Settings</h2>
        <button onClick={onClose} className="p-2 rounded-lg hover:bg-muted transition-colors">
          <X size={20} />
        </button>
      </div>

      {/* Scrollable body */}
      <div className="overflow-y-auto flex-1 p-6">
        <div className="max-w-5xl mx-auto space-y-7">
          {/* LLM Configuration */}
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

          {/* System Prompt */}
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

          {/* Secrets */}
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

            {/* Add secret — stacks on mobile */}
            <div className="flex flex-col sm:flex-row gap-2">
              <input
                type="text"
                placeholder="Name"
                value={newSecretName}
                onChange={(e) => setNewSecretName(e.target.value)}
                className="flex-1 rounded-xl border border-border bg-muted px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-primary"
              />
              <input
                type="password"
                placeholder="Value"
                value={newSecretValue}
                onChange={(e) => setNewSecretValue(e.target.value)}
                className="flex-1 rounded-xl border border-border bg-muted px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-primary"
              />
              <button
                onClick={addSecret}
                disabled={!newSecretName || !newSecretValue}
                className="flex items-center justify-center gap-2 rounded-xl bg-secondary px-5 py-3 text-base font-medium text-secondary-foreground hover:bg-secondary/80 disabled:opacity-50 transition-colors sm:w-auto"
              >
                <Plus size={18} />
                <span className="sm:hidden">Add Secret</span>
              </button>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

export default Settings;
