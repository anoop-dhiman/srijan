import { useState, useEffect } from 'react';
import { Folder, FolderOpen, FileText, ChevronRight, ChevronDown, Loader2 } from 'lucide-react';
import type { WorkspaceInfo } from '../hooks/useChat';
import { apiFetch } from '../lib/api';

interface Entry {
  name: string;
  type: 'file' | 'dir';
  size?: number;
  modified?: string;
}

interface FileBrowserProps {
  workspaces: WorkspaceInfo[];
  currentWorkspace: string | null;
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

export function FileBrowser({ workspaces, currentWorkspace }: FileBrowserProps) {
  const [workspace, setWorkspace] = useState<string>(currentWorkspace || '');
  const [tree, setTree] = useState<TreeNode[]>([]);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [fileContent, setFileContent] = useState<string | null>(null);
  const [loadingTree, setLoadingTree] = useState(false);
  const [loadingFile, setLoadingFile] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    // Find the node
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
      // Load children
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
    setSelectedFile(path);
    setLoadingFile(true);
    setFileContent(null);
    setError(null);
    try {
      const data = await apiFetch(`/workspaces/${encodeURIComponent(workspace)}/file?path=${encodeURIComponent(path)}`);
      setFileContent(data.content);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoadingFile(false);
    }
  };

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
            {/* Breadcrumb */}
            <div className="px-4 py-2 border-b border-border shrink-0 bg-muted">
              <p className="text-xs font-mono text-muted-foreground truncate">
                {workspace} / {selectedFile}
              </p>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-auto">
              {loadingFile && (
                <div className="flex items-center justify-center h-full gap-2 text-sm text-muted-foreground">
                  <Loader2 size={16} className="animate-spin" /> Loading…
                </div>
              )}
              {error && (
                <div className="p-4 text-sm text-destructive">{error}</div>
              )}
              {fileContent !== null && !loadingFile && (
                <pre className="p-4 text-xs font-mono whitespace-pre leading-relaxed text-foreground overflow-x-auto">
                  {fileContent.split('\n').map((line, i) => (
                    <div key={i} className="flex gap-4">
                      <span className="select-none text-muted-foreground/50 text-right shrink-0" style={{ minWidth: '3ch' }}>
                        {i + 1}
                      </span>
                      <span>{line}</span>
                    </div>
                  ))}
                </pre>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
