import React from 'react';

interface TokenPieProps {
  inputTokens: number;
  outputTokens: number;
  model: string;
}

function getContextLimit(model: string): number {
  if (model.startsWith('claude-3-5') || model.startsWith('claude-3') || model.startsWith('claude-sonnet-4')) {
    return 200000;
  }
  return 200000;
}

function getColor(pct: number): string {
  if (pct >= 75) return '#ef4444'; // red-500
  if (pct >= 50) return '#f59e0b'; // amber-500
  return '#3b82f6'; // blue-500
}

export function TokenPie({ inputTokens, outputTokens, model }: TokenPieProps) {
  const total = inputTokens + outputTokens;
  if (total === 0) return null;

  const limit = getContextLimit(model);
  const ratio = Math.min(total / limit, 1);
  const pct = Math.round(ratio * 100);
  const color = getColor(pct);

  // SVG ring (donut chart) parameters
  const size = 24;
  const cx = size / 2;
  const cy = size / 2;
  const r = 9;
  const strokeWidth = 4;
  const circumference = 2 * Math.PI * r;
  const dashArray = circumference;
  const dashOffset = circumference * (1 - ratio);

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      title={`${total.toLocaleString()} tokens used (${pct}%)`}
      aria-label={`${total.toLocaleString()} tokens used (${pct}%)`}
      style={{ display: 'inline-block', verticalAlign: 'middle' }}
    >
      {/* Background ring */}
      <circle
        cx={cx}
        cy={cy}
        r={r}
        fill="none"
        stroke="#e5e7eb"
        strokeWidth={strokeWidth}
      />
      {/* Filled portion */}
      <circle
        cx={cx}
        cy={cy}
        r={r}
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeDasharray={dashArray}
        strokeDashoffset={dashOffset}
        strokeLinecap="round"
        transform={`rotate(-90 ${cx} ${cy})`}
      />
    </svg>
  );
}
