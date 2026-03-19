import { useState, useEffect, lazy, Suspense } from 'react';
import { Folder, FolderOpen, FileText, ChevronRight, ChevronDown, Loader2, Pencil, Save, X } from 'lucide-react';
import type { WorkspaceInfo } from '../hooks/useChat';
import { apiFetch } from '../lib/api';

const MonacoEditor = lazy(() => import('@monaco-editor/react'));

interface Entry {
  name: string;
  type: 'file' | 'dir';
  size?: number;
  modified?: string;
}

interface FileBrowserProps {
  workspaces: WorkspaceInfo[];
  currentWorkspace: string | null;
  theme?: 'light' | 'dark';
}

interface TreeNode {
  name: string;
  type: 'file' | 'dir';
  path: string;
  size?: number;
  expanded?: boolean;
  children?: TreeNode[];
  loaded?: boolean;
}

function detectLanguage(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase() ?? '';
  const map: Record<string, string> = {
    ts: 'typescript', tsx: 'typescript', js: 'javascript', jsx: 'javascript',
    py: 'python', rs: 'rust', go: 'go', java: 'java',
    json: 'json', yaml: 'yaml', yml: 'yaml', md: 'markdown',
    html: 'html', css: 'css', sh: 'shell', sql: 'sql',
    dockerfile: 'dockerfile', toml: 'ini',
  };
  return map[ext] ?? 'plaintext';
}

function buildNodes(entries: Entry[], basePath: string): TreeNode[] {
  return entries
    .sort((a, b) => {
      if (a.type !== b.type) return a.type === 'dir' ? -1 : 1;
      return a.name.localeCompare(b.name);
    })
    .map((e) => ({
      name: e.name,
      type: e.type,
      path: basePath ? `${basePath}/${e.name}` : e.name,
      size: e.size,
      expanded: false,
      children: e.type === 'dir' ? [] : undefined,
      loaded: false,
    }));
}

function TreeItem({
  node,
  depth,
  selectedFile,
  onSelectFile,
  onToggleDir,
}: {
  node: TreeNode;
  depth: number;
  selectedFile: string | null;
  onSelectFile: (path: string) => void;
  onToggleDir: (path: string) => void;
}) {
  const isSelected = node.type === 'file' && node.path === selectedFile;

  return (
    <>
      <button
        onClick={() => {
          if (node.type === 'dir') onToggleDir(node.path);
          else onSelectFile(node.path);
        }}
        className={`w-full flex items-center gap-1.5 px-2 py-1 text-sm rounded transition-colors text-left ${
          isSelected
            ? 'bg-primary/10 text-primary'
            : 'text-foreground hover:bg-muted'
        }`}
        style={{ paddingLeft: `${8 + depth * 16}px` }}
      >
        {node.type === 'dir' ? (
          <>
            {node.expanded ? (
              <ChevronDown size={12} className="shrink-0 text-muted-foreground" />
            ) : (
              <ChevronRight size={12} className="shrink-0 text-muted-foreground" />
            )}
            {node.expanded ? (
              <FolderOpen size={14} className="shrink-0 text-yellow-500/80" />
            ) : (
              <Folder size={14} className="shrink-0 text-yellow-500/80" />
            )}
          </>
        ) : (
          <>
            <span className="w-3 shrink-0" />
            <FileText size={14} className="shrink-0 text-muted-foreground" />
          </>
        )}
        <span className="truncate font-mono text-xs">{node.name}</span>
      </button>
      {node.type === 'dir' && node.expanded && node.children && (
        <div>
          {node.children.map((child) => (
            <TreeItem
              key={child.path}
              node={child}
              depth={depth + 1}
              selectedFile={selectedFile}
              onSelectFile={onSelectFile}
              onToggleDir={onToggleDir}
            />
          ))}
        </div>
      )}
    </>
  );
}

function updateNodeInTree(
  nodes: TreeNode[],
  targetPath: string,
  updater: (node: TreeNode) => TreeNode
): TreeNode[] {
  return nodes.map((node) => {
    if (node.path === targetPath) return updater(node);
    if (node.children) {
      return { ...node, children: updateNodeInTree(node.children, targetPath, updater) };
    }
    return node;
  });
}

export function FileBrowser({ workspaces, currentWorkspace, theme = 'dark' }: FileBrowserProps) {
  const [workspace, setWorkspace] = useState<string>(currentWorkspace || '');
  const [tree, setTree] = useState<TreeNode[]>([]);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [fileContent, setFileContent] = useState<string | null>(null);
  const [loadingTree, setLoadingTree] = useState(false);
  const [loadingFile, setLoadingFile] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Edit state
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState('');
  const [isDirty, setIsDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const loadDir = async (ws: string, path: string): Promise<TreeNode[]> => {
    const data = await apiFetch(`/workspaces/${encodeURIComponent(ws)}/files?path=${encodeURIComponent(path)}`);
    return buildNodes(data.entries, path);
  };

  useEffect(() => {
    if (!workspace) { setTree([]); setFileContent(null); setSelectedFile(null); return; }
    setLoadingTree(true);
    setError(null);
    loadDir(workspace, '').then((nodes) => {
      setTree(nodes);
    }).catch((err) => {
      setError(err.message);
    }).finally(() => {
      setLoadingTree(false);
    });
  }, [workspace]);

  const handleToggleDir = async (path: string) => {
    const findNode = (nodes: TreeNode[], p: string): TreeNode | null => {
      for (const n of nodes) {
        if (n.path === p) return n;
        if (n.children) {
          const found = findNode(n.children, p);
          if (found) return found;
        }
      }
      return null;
    };

    const node = findNode(tree, path);
    if (!node) return;

    if (!node.expanded && !node.loaded) {
      try {
        const children = await loadDir(workspace, path);
        setTree((prev) =>
          updateNodeInTree(prev, path, (n) => ({ ...n, expanded: true, loaded: true, children }))
        );
      } catch {
        // ignore
      }
    } else {
      setTree((prev) =>
        updateNodeInTree(prev, path, (n) => ({ ...n, expanded: !n.expanded }))
      );
    }
  };

  const handleSelectFile = async (path: string) => {
    // Reset edit state when switching files
    setIsEditing(false);
    setIsDirty(false);
    setSaveError(null);

    setSelectedFile(path);
    setLoadingFile(true);
    setFileContent(null);
    setError(null);
    try {
      const data = await apiFetch(`/workspaces/${encodeURIComponent(workspace)}/file?path=${encodeURIComponent(path)}`);
      setFileContent(data.content);
      setEditContent(data.content);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoadingFile(false);
    }
  };

  const handleEdit = () => {
    setEditContent(fileContent ?? '');
    setIsDirty(false);
    setSaveError(null);
    setIsEditing(true);
  };

  const handleSave = async () => {
    if (!selectedFile) return;
    setSaving(true);
    setSaveError(null);
    try {
      await apiFetch(`/workspaces/${encodeURIComponent(workspace)}/file?path=${encodeURIComponent(selectedFile)}`, {
        method: 'PUT',
        body: JSON.stringify({ content: editContent }),
      });
      setFileContent(editContent);
      setIsDirty(false);
      setIsEditing(false);
    } catch (err: any) {
      setSaveError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleCancelEdit = () => {
    if (isDirty && !window.confirm('Discard unsaved changes?')) return;
    setIsEditing(false);
    setIsDirty(false);
    setSaveError(null);
    setEditContent(fileContent ?? '');
  };

  const monacoTheme = theme === 'dark' ? 'vs-dark' : 'vs';
  const language = selectedFile ? detectLanguage(selectedFile.split('/').pop() ?? '') : 'plaintext';

  return (
    <div className="flex flex-1 min-h-0">
      {/* Left panel — tree */}
      <div className="w-60 shrink-0 flex flex-col border-r border-border bg-muted">
        {/* Workspace selector */}
        <div className="p-3 border-b border-border shrink-0">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/70 mb-1.5">
            Workspace
          </p>
          <select
            value={workspace}
            onChange={(e) => setWorkspace(e.target.value)}
            className="w-full rounded-lg border border-border bg-background px-2.5 py-1.5 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-primary"
          >
            {!workspace && <option value="">Select workspace…</option>}
            {workspaces.map((ws) => (
              <option key={ws.name} value={ws.name}>{ws.name}</option>
            ))}
          </select>
        </div>

        {/* Tree */}
        <div className="flex-1 overflow-y-auto py-1">
          {loadingTree && (
            <div className="flex items-center gap-2 px-3 py-3 text-sm text-muted-foreground">
              <Loader2 size={14} className="animate-spin" /> Loading…
            </div>
          )}
          {!workspace && !loadingTree && (
            <p className="px-3 py-3 text-sm text-muted-foreground">Select a workspace to browse files.</p>
          )}
          {workspace && !loadingTree && tree.length === 0 && (
            <p className="px-3 py-3 text-sm text-muted-foreground">Empty workspace.</p>
          )}
          {tree.map((node) => (
            <TreeItem
              key={node.path}
              node={node}
              depth={0}
              selectedFile={selectedFile}
              onSelectFile={handleSelectFile}
              onToggleDir={handleToggleDir}
            />
          ))}
        </div>
      </div>

      {/* Right panel — file content */}
      <div className="flex-1 flex flex-col min-w-0">
        {!selectedFile && (
          <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
            {workspace ? 'Select a file to view its contents.' : 'Select a workspace first.'}
          </div>
        )}

        {selectedFile && (
          <>
            {/* Breadcrumb + action buttons */}
            <div className="px-4 py-2 border-b border-border shrink-0 bg-muted flex items-center justify-between gap-3">
              <p className="text-xs font-mono text-muted-foreground truncate">
                {workspace} / {selectedFile}
              </p>
              <div className="flex items-center gap-1.5 shrink-0">
                {!isEditing ? (
                  <button
                    onClick={handleEdit}
                    disabled={fileContent === null || loadingFile}
                    className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium border border-border hover:bg-background/60 disabled:opacity-40 transition-colors"
                  >
                    <Pencil size={12} />
                    Edit
                  </button>
                ) : (
                  <>
                    <button
                      onClick={handleSave}
                      disabled={saving}
                      className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
                    >
                      <Save size={12} />
                      {saving ? 'Saving…' : 'Save'}
                    </button>
                    <button
                      onClick={handleCancelEdit}
                      disabled={saving}
                      className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium border border-border hover:bg-background/60 disabled:opacity-40 transition-colors"
                    >
                      <X size={12} />
                      Cancel
                    </button>
                  </>
                )}
              </div>
            </div>

            {saveError && (
              <div className="px-4 py-1.5 text-xs text-destructive border-b border-border bg-destructive/5">
                {saveError}
              </div>
            )}

            {/* Content */}
            <div className="flex-1 overflow-hidden">
              {loadingFile && (
                <div className="flex items-center justify-center h-full gap-2 text-sm text-muted-foreground">
                  <Loader2 size={16} className="animate-spin" /> Loading…
                </div>
              )}
              {error && (
                <div className="p-4 text-sm text-destructive">{error}</div>
              )}
              {fileContent !== null && !loadingFile && (
                <Suspense fallback={
                  <div className="flex items-center justify-center h-full gap-2 text-sm text-muted-foreground">
                    <Loader2 size={16} className="animate-spin" /> Loading editor…
                  </div>
                }>
                  <MonacoEditor
                    height="100%"
                    language={language}
                    theme={monacoTheme}
                    value={isEditing ? editContent : fileContent}
                    onChange={(val) => {
                      if (isEditing) {
                        setEditContent(val ?? '');
                        setIsDirty(true);
                      }
                    }}
                    options={{
                      readOnly: !isEditing,
                      minimap: { enabled: false },
                      fontSize: 13,
                      lineNumbers: 'on',
                      scrollBeyondLastLine: false,
                      wordWrap: 'on',
                    }}
                  />
                </Suspense>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
