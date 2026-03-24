import { useState } from 'react';
import { CheckCircle2, Loader2, XCircle, ChevronDown, ChevronRight, Play, SkipForward } from 'lucide-react';

export interface PlanStep {
  id: string;
  title: string;
  description?: string;
  dependencies?: string[];
  status: 'pending' | 'running' | 'done' | 'failed';
}

interface PlanCardProps {
  title: string;
  steps: PlanStep[];
  onExecuteAll?: () => void;
  onExecuteStep?: (stepId: string) => void;
  onCancel?: () => void;
}

export function PlanCard({ title, steps, onExecuteAll, onCancel }: PlanCardProps) {
  const [expanded, setExpanded] = useState(true);
  const doneCount = steps.filter(s => s.status === 'done').length;
  const hasRunning = steps.some(s => s.status === 'running');
  const allDone = doneCount === steps.length;

  return (
    <div className="my-2 rounded-lg border border-border bg-muted/30 overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setExpanded(e => !e)}
        className="w-full flex items-center gap-2 px-4 py-3 text-left hover:bg-muted/50 transition-colors"
      >
        <span className="text-sm font-semibold flex-1 truncate">Plan: {title}</span>
        <span className="text-xs text-muted-foreground shrink-0">
          {doneCount}/{steps.length} steps
        </span>
        {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
      </button>

      {expanded && (
        <>
          {/* Steps */}
          <div className="border-t border-border divide-y divide-border/50">
            {steps.map((step, idx) => (
              <div key={step.id} className="flex items-start gap-3 px-4 py-2.5">
                <div className="mt-0.5 shrink-0">
                  {step.status === 'done' && <CheckCircle2 size={16} className="text-green-500" />}
                  {step.status === 'running' && <Loader2 size={16} className="animate-spin text-primary" />}
                  {step.status === 'failed' && <XCircle size={16} className="text-destructive" />}
                  {step.status === 'pending' && (
                    <span className="flex items-center justify-center w-4 h-4 rounded-full border border-muted-foreground text-[10px] text-muted-foreground font-medium">
                      {idx + 1}
                    </span>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className={`text-sm font-medium ${step.status === 'done' ? 'line-through text-muted-foreground' : ''}`}>
                    {step.title}
                  </div>
                  {step.description && (
                    <div className="text-xs text-muted-foreground mt-0.5">{step.description}</div>
                  )}
                  {step.dependencies && step.dependencies.length > 0 && (
                    <div className="text-xs text-muted-foreground/70 mt-0.5">
                      Needs: {step.dependencies.join(', ')}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Actions */}
          {!allDone && (
            <div className="border-t border-border px-4 py-2.5 flex gap-2">
              {onExecuteAll && !hasRunning && (
                <button
                  onClick={onExecuteAll}
                  className="flex items-center gap-1.5 rounded bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90"
                >
                  <Play size={12} />
                  Execute All
                </button>
              )}
              {onCancel && (
                <button
                  onClick={onCancel}
                  className="flex items-center gap-1.5 rounded border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted"
                >
                  <SkipForward size={12} />
                  Skip Plan
                </button>
              )}
              {hasRunning && (
                <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Loader2 size={12} className="animate-spin" />
                  Executing...
                </span>
              )}
            </div>
          )}
          {allDone && (
            <div className="border-t border-border px-4 py-2 text-xs text-green-600 dark:text-green-400 flex items-center gap-1.5">
              <CheckCircle2 size={12} />
              All steps complete
            </div>
          )}
        </>
      )}
    </div>
  );
}
