import { getDb } from '../db/store.js';

export function getMonthWindowStart(): string {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
}

export interface SpendingInfo {
  spent_usd: number;
  limit_usd: number | null;
  percent: number | null;
}

export function getUserSpending(userId: string, windowStart: string): SpendingInfo {
  const db = getDb();
  const usageRow = db.prepare(
    `SELECT COALESCE(SUM(cost_usd), 0) as spent_usd FROM token_usage WHERE user_id = ? AND created_at >= ?`
  ).get(userId, windowStart) as { spent_usd: number };

  const userRow = db.prepare(
    `SELECT spending_limit_usd FROM users WHERE id = ?`
  ).get(userId) as { spending_limit_usd: number | null } | undefined;

  const spent = usageRow.spent_usd;
  const limit = userRow?.spending_limit_usd ?? null;
  const percent = limit != null && limit > 0 ? (spent / limit) * 100 : null;
  return { spent_usd: spent, limit_usd: limit, percent };
}

export function getWorkspaceSpending(workspaceName: string, windowStart: string): SpendingInfo {
  const db = getDb();
  const usageRow = db.prepare(
    `SELECT COALESCE(SUM(cost_usd), 0) as spent_usd FROM token_usage WHERE workspace_name = ? AND created_at >= ?`
  ).get(workspaceName, windowStart) as { spent_usd: number };

  const wsRow = db.prepare(
    `SELECT spending_limit_usd FROM workspace_spending WHERE workspace_name = ?`
  ).get(workspaceName) as { spending_limit_usd: number | null } | undefined;

  const spent = usageRow.spent_usd;
  const limit = wsRow?.spending_limit_usd ?? null;
  const percent = limit != null && limit > 0 ? (spent / limit) * 100 : null;
  return { spent_usd: spent, limit_usd: limit, percent };
}

export interface SpendingCheck {
  allowed: boolean;
  reason?: string;
}

export function checkSpendingLimits(userId: string, workspaceName: string): SpendingCheck {
  const windowStart = getMonthWindowStart();

  const userSpending = getUserSpending(userId, windowStart);
  if (userSpending.limit_usd != null && userSpending.spent_usd >= userSpending.limit_usd) {
    return {
      allowed: false,
      reason: `Monthly spending limit of $${userSpending.limit_usd.toFixed(2)} exceeded ($${userSpending.spent_usd.toFixed(4)} spent)`,
    };
  }

  const wsSpending = getWorkspaceSpending(workspaceName, windowStart);
  if (wsSpending.limit_usd != null && wsSpending.spent_usd >= wsSpending.limit_usd) {
    return {
      allowed: false,
      reason: `Workspace monthly spending limit of $${wsSpending.limit_usd.toFixed(2)} exceeded ($${wsSpending.spent_usd.toFixed(4)} spent)`,
    };
  }

  return { allowed: true };
}
