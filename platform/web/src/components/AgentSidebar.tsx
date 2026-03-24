import { useState } from 'react';
import { Plus, Circle, Loader2, Bot, ChevronDown, ChevronRight } from 'lucide-react';
import { getRoles, type AgentRole } from '../lib/api';

export interface SessionAgent {
  id: string;
  session_id: string;
  name: string;
  display_name: string;
  role_id: string | null;
  subdir: string;
  claude_session_id: string | null;
  status: string;
  created_at: string;
}

interface AgentSidebarProps {
  agents: SessionAgent[];
  activeAgentId?: string;
  onCreateAgent: (name: string, displayName: string, roleId?: string, subdir?: string) => void;
}

const AGENT_COLORS = [
  'text-blue-500', 'text-green-500', 'text-purple-500', 'text-orange-500',
  'text-pink-500', 'text-cyan-500', 'text-yellow-500', 'text-red-500',
];

// eslint-disable-next-line react-refresh/only-export-components
export function getAgentColor(name: string): string {
  let hash = 0;
  for (const ch of name) hash = (hash * 31 + ch.charCodeAt(0)) & 0xffffff;
  return AGENT_COLORS[Math.abs(hash) % AGENT_COLORS.length];
}

interface CreateFormProps {
  name: string;
  displayName: string;
  subdir: string;
  roles: AgentRole[];
  selectedRoleId: string;
  onNameChange: (v: string) => void;
  onDisplayNameChange: (v: string) => void;
  onSubdirChange: (v: string) => void;
  onRoleChange: (v: string) => void;
  onCreate: () => void;
  onCancel: () => void;
}

function CreateForm({
  name, displayName, subdir, roles, selectedRoleId,
  onNameChange, onDisplayNameChange, onSubdirChange, onRoleChange,
  onCreate, onCancel,
}: CreateFormProps) {
  return (
    <div className="mt-2 space-y-1.5 rounded-lg border border-border p-2 bg-background">
      <input
        placeholder="name (e.g. frontend)"
        value={name}
        onChange={e => onNameChange(e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, ''))}
        className="w-full rounded border border-input bg-muted px-2 py-1 text-xs"
      />
      <input
        placeholder="Display Name"
        value={displayName}
        onChange={e => onDisplayNameChange(e.target.value)}
        className="w-full rounded border border-input bg-muted px-2 py-1 text-xs"
      />
      <input
        placeholder="Subdirectory (optional)"
        value={subdir}
        onChange={e => onSubdirChange(e.target.value)}
        className="w-full rounded border border-input bg-muted px-2 py-1 text-xs"
      />
      {roles.length > 0 && (
        <select
          value={selectedRoleId}
          onChange={e => onRoleChange(e.target.value)}
          className="w-full rounded border border-input bg-muted px-2 py-1 text-xs"
        >
          <option value="">No role</option>
          {roles.map(r => (
            <option key={r.id} value={r.id}>{r.display_name}</option>
          ))}
        </select>
      )}
      <div className="flex gap-1.5">
        <button
          onClick={onCreate}
          disabled={!name || !displayName}
          className="flex-1 rounded bg-primary px-2 py-1 text-xs text-primary-foreground disabled:opacity-50"
        >
          Create
        </button>
        <button
          onClick={onCancel}
          className="rounded border border-border px-2 py-1 text-xs text-muted-foreground hover:bg-muted"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

export function AgentSidebar({ agents, activeAgentId, onCreateAgent }: AgentSidebarProps) {
  const [expanded, setExpanded] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDisplayName, setNewDisplayName] = useState('');
  const [newSubdir, setNewSubdir] = useState('');
  const [roles, setRoles] = useState<AgentRole[]>([]);
  const [selectedRoleId, setSelectedRoleId] = useState('');
  const [rolesLoaded, setRolesLoaded] = useState(false);

  const handleShowCreate = () => {
    setShowCreate(true);
    if (!rolesLoaded) {
      getRoles().then(r => { setRoles(r); setRolesLoaded(true); }).catch(() => {});
    }
  };

  const handleCreate = () => {
    if (!newName.trim() || !newDisplayName.trim()) return;
    onCreateAgent(newName.trim(), newDisplayName.trim(), selectedRoleId || undefined, newSubdir.trim() || undefined);
    setNewName(''); setNewDisplayName(''); setNewSubdir(''); setSelectedRoleId('');
    setShowCreate(false);
  };

  const createFormProps: CreateFormProps = {
    name: newName, displayName: newDisplayName, subdir: newSubdir,
    roles, selectedRoleId,
    onNameChange: setNewName,
    onDisplayNameChange: setNewDisplayName,
    onSubdirChange: setNewSubdir,
    onRoleChange: setSelectedRoleId,
    onCreate: handleCreate,
    onCancel: () => setShowCreate(false),
  };

  if (agents.length === 0 && !showCreate) {
    return (
      <div className="px-3 py-2">
        <button
          onClick={handleShowCreate}
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <Plus size={12} />
          Add Agent
        </button>
      </div>
    );
  }

  if (agents.length === 0 && showCreate) {
    return (
      <div className="px-3 py-2">
        <CreateForm {...createFormProps} />
      </div>
    );
  }

  return (
    <div className="border-t border-border">
      <button
        onClick={() => setExpanded(e => !e)}
        className="w-full flex items-center gap-2 px-3 py-2 text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors"
      >
        <Bot size={12} />
        <span className="flex-1 text-left uppercase tracking-wider">Agents</span>
        {expanded ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
      </button>

      {expanded && (
        <div className="pb-1">
          {agents.map(agent => {
            const isRunning = agent.status === 'running' || agent.status === 'active';
            const isActive = activeAgentId === agent.name;
            const color = getAgentColor(agent.name);
            return (
              <div
                key={agent.id}
                className={`flex items-center gap-2 px-3 py-1.5 ${isActive ? 'bg-muted/50' : ''}`}
              >
                <div className={`shrink-0 ${color}`}>
                  {isRunning
                    ? <Loader2 size={10} className="animate-spin" />
                    : <Circle size={10} fill="currentColor" />
                  }
                </div>
                <span className="flex-1 text-xs truncate">
                  {agent.display_name}
                  <span className="text-muted-foreground ml-1 font-mono">@{agent.name}</span>
                </span>
              </div>
            );
          })}

          <div className="px-3 pt-1">
            {!showCreate ? (
              <button
                onClick={handleShowCreate}
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                <Plus size={11} />
                Add Agent
              </button>
            ) : (
              <CreateForm {...createFormProps} />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
