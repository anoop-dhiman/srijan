export type ThinkingMode = 'none' | 'low' | 'medium' | 'extended';

export const THINKING_BUDGETS: Record<ThinkingMode, number | undefined> = {
  none: undefined,
  low: 4000,
  medium: 16000,
  extended: 64000,
};
