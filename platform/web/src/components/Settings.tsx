import { useState, useEffect } from 'react';
import { X, Eye, EyeOff, Plus, Trash2, Save } from 'lucide-react';
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
  const [apiKey, setApiKey] = useState('');
  const [model, setModel] = useState('claude-sonnet-4-6');
  const [showKey, setShowKey] = useState(false);
  const [secrets, setSecrets] = useState<Secret[]>([]);
  const [newSecretName, setNewSecretName] = useState('');
  const [newSecretValue, setNewSecretValue] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!open) return;
    loadConfig();
    loadSecrets();
  }, [open]);

  const loadConfig = async () => {
    try {
      const config = await apiFetch('/config');
      if (config.llm) {
        setApiKey(config.llm.apiKey || '');
        setModel(config.llm.model || 'claude-sonnet-4-6');
      }
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
        body: JSON.stringify({ value: { apiKey, model } }),
      });
      setMessage('Settings saved');
      setTimeout(() => setMessage(''), 2000);
    } catch (err: any) {
      setMessage(err.message);
    } finally {
      setSaving(false);
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
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 p-4 overflow-y-auto">
      <div className="w-full max-w-lg bg-background border border-border rounded-2xl my-8">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h2 className="font-semibold">Settings</h2>
          <button onClick={onClose} className="p-1.5 rounded-md hover:bg-muted transition-colors">
            <X size={18} />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* LLM Configuration */}
          <section className="space-y-3">
            <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">LLM Provider</h3>

            <div className="space-y-2">
              <label className="text-sm">API Key</label>
              <div className="relative">
                <input
                  type={showKey ? 'text' : 'password'}
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="sk-ant-..."
                  className="w-full rounded-lg border border-border bg-muted px-4 py-2.5 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                />
                <button
                  type="button"
                  onClick={() => setShowKey(!showKey)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                >
                  {showKey ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm">Model</label>
              <select
                value={model}
                onChange={(e) => setModel(e.target.value)}
                className="w-full rounded-lg border border-border bg-muted px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              >
                <option value="claude-sonnet-4-6">Claude Sonnet 4.6</option>
                <option value="claude-opus-4-6">Claude Opus 4.6</option>
                <option value="claude-haiku-4-5-20251001">Claude Haiku 4.5</option>
              </select>
            </div>

            <button
              onClick={saveConfig}
              disabled={saving}
              className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              <Save size={16} />
              {saving ? 'Saving...' : 'Save'}
            </button>

            {message && (
              <p className="text-sm text-secondary-foreground">{message}</p>
            )}
          </section>

          {/* Secrets */}
          <section className="space-y-3">
            <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Secrets</h3>

            <div className="space-y-2">
              {secrets.map((s) => (
                <div
                  key={s.id}
                  className="flex items-center justify-between rounded-lg border border-border px-4 py-2.5"
                >
                  <span className="text-sm font-mono">{s.name}</span>
                  <button
                    onClick={() => deleteSecret(s.id)}
                    className="p-1 text-muted-foreground hover:text-destructive transition-colors"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>

            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Name"
                value={newSecretName}
                onChange={(e) => setNewSecretName(e.target.value)}
                className="flex-1 rounded-lg border border-border bg-muted px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
              <input
                type="password"
                placeholder="Value"
                value={newSecretValue}
                onChange={(e) => setNewSecretValue(e.target.value)}
                className="flex-1 rounded-lg border border-border bg-muted px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
              <button
                onClick={addSecret}
                disabled={!newSecretName || !newSecretValue}
                className="shrink-0 rounded-lg bg-secondary px-3 py-2 text-secondary-foreground hover:bg-secondary/80 disabled:opacity-50"
              >
                <Plus size={16} />
              </button>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
