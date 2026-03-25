import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { apiFetch } from '../lib/api';

interface FileEntry {
  name: string;
  type: 'file' | 'dir';
  size?: number;
  modified?: string;
  path: string; // relative path within workspace
}

interface UseFileMentionsOptions {
  workspaceName: string | null;
  input: string;
  setInput: (v: string) => void;
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
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

async function fetchFileTree(workspaceName: string): Promise<FileEntry[]> {
  try {
    const res = await apiFetch(`/workspaces/${encodeURIComponent(workspaceName)}/files/tree?maxDepth=3`);
    return (res?.files ?? []).map((f: { name: string; path: string; size?: number; modified?: string }) => ({
      name: f.name,
      type: 'file' as const,
      size: f.size,
      modified: f.modified,
      path: f.path,
    }));
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
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [dismissedInput, setDismissedInput] = useState<string | null>(null);
  const fetchedWorkspace = useRef<string | null>(null);

  // Derive mention state directly from input — no setState-in-effect
  const detectedQuery = useMemo(() => detectMentionQuery(input), [input]);
  // mentionOpen is false when user explicitly dismissed the menu for the current input value
  const mentionOpen = detectedQuery !== null && input !== dismissedInput;
  const mentionQuery = detectedQuery ?? '';

  // Fetch file list lazily — only when @ mention is first triggered
  useEffect(() => {
    if (!mentionOpen || !workspaceName) return;
    if (fetchedWorkspace.current === workspaceName) return;
    fetchedWorkspace.current = workspaceName;

    fetchFileTree(workspaceName).then((files) => {
      setAllFiles(files);
    });
  }, [mentionOpen, workspaceName]);

  const suggestions = mentionQuery
    ? allFiles.filter((f) => f.path.toLowerCase().includes(mentionQuery.toLowerCase())).slice(0, 8)
    : allFiles.slice(0, 8);

  const selectSuggestion = useCallback(
    (entry: FileEntry) => {
      // Replace the trailing @<query> with the file path
      const newInput = input.replace(/@([^\s@]*)$/, `@${entry.path} `);
      setInput(newInput);
      // mentionOpen auto-closes because @query is replaced; no setState needed
      // Restore focus to textarea
      setTimeout(() => textareaRef.current?.focus(), 0);
    },
    [input, setInput, textareaRef]
  );

  const closeMention = useCallback(() => {
    // Record current input as dismissed so mentionOpen becomes false
    setDismissedInput(input);
    setSelectedIndex(0);
  }, [input]);

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

  // Clamp so a stale index from a previous mention never goes out-of-bounds
  const safeIndex = suggestions.length > 0 ? Math.min(selectedIndex, suggestions.length - 1) : 0;

  return {
    mentionOpen,
    suggestions,
    selectedIndex: safeIndex,
    mentionQuery,
    handleKeyDown,
    selectSuggestion,
    closeMention,
  };
}
