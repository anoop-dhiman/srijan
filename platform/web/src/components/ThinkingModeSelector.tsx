import React from 'react';
import { Sparkles } from 'lucide-react';
import type { ThinkingMode } from './thinkingModes';

interface ThinkingModeSelectorProps {
  value: ThinkingMode;
  onChange: (mode: ThinkingMode) => void;
}

const MODES: ThinkingMode[] = ['none', 'low', 'medium', 'extended'];

const LABELS: Record<ThinkingMode, string> = {
  none: 'None',
  low: 'Low',
  medium: 'Medium',
  extended: 'Extended',
};

export function ThinkingModeSelector({ value, onChange }: ThinkingModeSelectorProps) {
  return (
    <div className="inline-flex rounded-full border border-gray-200 bg-gray-100 p-0.5 gap-0.5" role="group" aria-label="Thinking mode">
      {MODES.map((mode) => {
        const isActive = mode === value;
        return (
          <button
            key={mode}
            type="button"
            onClick={() => onChange(mode)}
            className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 ${
              isActive
                ? 'bg-white text-blue-700 shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}
            aria-pressed={isActive}
          >
            {mode === 'extended' && (
              <Sparkles size={11} className={isActive ? 'text-blue-500' : 'text-gray-400'} />
            )}
            {LABELS[mode]}
          </button>
        );
      })}
    </div>
  );
}
