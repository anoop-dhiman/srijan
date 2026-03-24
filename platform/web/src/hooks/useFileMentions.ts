import { useState, useEffect, useCallback, useRef } from 'react';
import { apiFetch } from '../lib/api';

interface FileEntry {
  name: string;
  type: 'file' | 'directory';
  size?: number;
  modified?: string;
  path: string; // relative path within workspace
}

interface UseFileMentionsOptions {
  workspaceName: string | null;
  input: string;
  setInput: (v: string) => void;
  textareaRef: React.RefObject<HTMLTextAreaElement>;
}

interface UseFileMentionsReturn {
  mentionOpen: boolean;
  suggestions: FileEntry[];
  selectedIndex: number;
  mentionQuery: string;
  handleKeyDown: (e: React.KeyboardEvent) => boolean;
  selectSuggestion: (entry: FileEntry) => void;
  closeMention: () => void;
}

const MAX_DEPTH = 3;

async function fetchFilesRecursive(
  workspaceName: string,
  dirPath: string,
  depth: number
): Promise<FileEntry[]> {
  if (depth > MAX_DEPTH) return [];
  try {
    const encodedPath = encodeURIComponent(dirPath);
    const res = await apiFetch(
      `/workspaces/${workspaceName}/files?path=${encodedPath}`
    );
    const entries: { name: string; type: string; size?: number; modified?: string }[] =
      res?.entries ?? [];

    const results: FileEntry[] = [];
    for (const entry of entries) {
      const fullPath = dirPath ? `${dirPath}/${entry.name}` : entry.name;
      if (entry.type === 'directory' && depth < MAX_DEPTH) {
        const children = await fetchFilesRecursive(workspaceName, fullPath, depth + 1);
        results.push(...children);
      } else if (entry.type === 'file') {
        results.push({
          name: entry.name,
          type: 'file',
          size: entry.size,
          modified: entry.modified,
          path: fullPath,
        });
      }
    }
    return results;
  } catch {
    return [];
  }
}

/**
 * Detects `@` trigger in the input (text ending with `@<query>` where query has no spaces).
 * Returns the query string after `@`, or null if no active trigger.
 */
function detectMentionQuery(input: string): string | null {
  const match = input.match(/@([^\s@]*)$/);
  if (match) return match[1];
  return null;
}

export function useFileMentions({
  workspaceName,
  input,
  setInput,
  textareaRef,
}: UseFileMentionsOptions): UseFileMentionsReturn {
  const [allFiles, setAllFiles] = useState<FileEntry[]>([]);
  const [mentionOpen, setMentionOpen] = useState(false);
  const [mentionQuery, setMentionQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const fetchedWorkspace = useRef<string | null>(null);

  // Fetch file list when workspace changes
  useEffect(() => {
    if (!workspaceName || fetchedWorkspace.current === workspaceName) return;
    fetchedWorkspace.current = workspaceName;

    fetchFilesRecursive(workspaceName, '', 0).then((files) => {
      setAllFiles(files);
    });
  }, [workspaceName]);

  // Detect @mention trigger on input change
  useEffect(() => {
    const query = detectMentionQuery(input);
    if (query !== null) {
      setMentionQuery(query);
      setSelectedIndex(0);
      setMentionOpen(true);
    } else {
      setMentionOpen(false);
      setMentionQuery('');
    }
  }, [input]);

  const suggestions = mentionQuery
    ? allFiles.filter((f) => f.path.toLowerCase().includes(mentionQuery.toLowerCase())).slice(0, 8)
    : allFiles.slice(0, 8);

  const selectSuggestion = useCallback(
    (entry: FileEntry) => {
      // Replace the trailing @<query> with the file path
      const newInput = input.replace(/@([^\s@]*)$/, `@${entry.path} `);
      setInput(newInput);
      setMentionOpen(false);
      setMentionQuery('');
      // Restore focus to textarea
      setTimeout(() => textareaRef.current?.focus(), 0);
    },
    [input, setInput, textareaRef]
  );

  const closeMention = useCallback(() => {
    setMentionOpen(false);
    setMentionQuery('');
    setSelectedIndex(0);
  }, []);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent): boolean => {
      if (!mentionOpen) return false;

      if (e.key === 'ArrowDown') {
        setSelectedIndex((i) => (i + 1) % Math.max(suggestions.length, 1));
        return true;
      }
      if (e.key === 'ArrowUp') {
        setSelectedIndex((i) =>
          (i - 1 + Math.max(suggestions.length, 1)) % Math.max(suggestions.length, 1)
        );
        return true;
      }
      if (e.key === 'Enter' && suggestions.length > 0) {
        selectSuggestion(suggestions[selectedIndex] ?? suggestions[0]);
        return true;
      }
      if (e.key === 'Escape') {
        closeMention();
        return true;
      }
      return false;
    },
    [mentionOpen, suggestions, selectedIndex, selectSuggestion, closeMention]
  );

  return {
    mentionOpen,
    suggestions,
    selectedIndex,
    mentionQuery,
    handleKeyDown,
    selectSuggestion,
    closeMention,
  };
}
