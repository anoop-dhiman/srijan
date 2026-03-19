import { useState, FormEvent } from 'react';
import { FolderOpen, Loader2 } from 'lucide-react';

interface WorkspaceEmptyStateProps {
  onCreate: (name: string) => Promise<void>;
}

export function WorkspaceEmptyState({ onCreate }: WorkspaceEmptyStateProps) {
  const [name, setName] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim() || creating) return;
    setCreating(true);
    setError('');
    try {
      await onCreate(name.trim());
    } catch (err: any) {
      setError(err.message || 'Failed to create workspace');
    }
    setCreating(false);
  };

  return (
    <div className="flex-1 flex items-center justify-center">
      <div className="text-center space-y-6 max-w-sm w-full px-6">
        <div className="flex justify-center">
          <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center">
            <FolderOpen size={32} className="text-muted-foreground" />
          </div>
        </div>
        <div className="space-y-2">
          <h2 className="text-xl font-semibold">No workspaces yet</h2>
          <p className="text-muted-foreground text-sm">
            Create your first workspace to start building.
          </p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-3">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="my-project"
            className="w-full rounded-xl border border-border bg-muted px-4 py-3 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary"
            autoFocus
          />
          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}
          <button
            type="submit"
            disabled={!name.trim() || creating}
            className="w-full py-3 rounded-xl bg-primary text-primary-foreground font-medium hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
          >
            {creating && <Loader2 size={16} className="animate-spin" />}
            Create Workspace
          </button>
        </form>
      </div>
    </div>
  );
}
