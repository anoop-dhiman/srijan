import React, { useEffect, useRef } from 'react';
import { FileText } from 'lucide-react';

interface FileEntry {
  name: string;
  type: 'file' | 'directory';
  path: string;
}

interface FileMentionDropdownProps {
  suggestions: FileEntry[];
  selectedIndex: number;
  onSelect: (entry: FileEntry) => void;
  onClose: () => void;
}

export function FileMentionDropdown({
  suggestions,
  selectedIndex,
  onSelect,
  onClose,
}: FileMentionDropdownProps) {
  const listRef = useRef<HTMLUListElement>(null);

  // Scroll selected item into view
  useEffect(() => {
    const el = listRef.current?.children[selectedIndex] as HTMLElement | undefined;
    el?.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex]);

  // Close on click outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (!listRef.current?.closest('[data-file-mention-dropdown]')?.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  if (suggestions.length === 0) return null;

  return (
    <div
      data-file-mention-dropdown
      className="absolute bottom-full left-0 z-50 mb-1 w-80 overflow-hidden rounded-lg border border-gray-200 bg-white shadow-lg"
    >
      <ul ref={listRef} role="listbox" aria-label="File suggestions">
        {suggestions.slice(0, 8).map((entry, i) => {
          // Separate directory path from filename
          const parts = entry.path.split('/');
          const fileName = parts[parts.length - 1];
          const dirPath = parts.length > 1 ? parts.slice(0, -1).join('/') : '';

          return (
            <li
              key={entry.path}
              role="option"
              aria-selected={i === selectedIndex}
              onMouseDown={(e) => {
                e.preventDefault(); // prevent textarea blur
                onSelect(entry);
              }}
              className={`flex cursor-pointer items-center gap-2 px-3 py-2 text-sm transition-colors ${
                i === selectedIndex
                  ? 'bg-blue-50 text-blue-700'
                  : 'text-gray-700 hover:bg-gray-50'
              }`}
            >
              <FileText
                size={14}
                className={`shrink-0 ${i === selectedIndex ? 'text-blue-500' : 'text-gray-400'}`}
              />
              <span className="flex-1 truncate font-medium text-sm">{fileName}</span>
              {dirPath && (
                <span className="shrink-0 text-xs text-gray-400 font-normal">{dirPath}</span>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
