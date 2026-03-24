import { AgentRunner, type RoleConfig } from './runner.js';
import { getWorkspaceRoot } from '../git/manager.js';
import { join } from 'path';

interface AgentEntry {
  runner: AgentRunner;
  agentDbId: string;
}

// Registry: sessionId -> agentName -> AgentEntry
const registry = new Map<string, Map<string, AgentEntry>>();

export interface CreateAgentOptions {
  sessionId: string;
  agentDbId: string;
  agentId: string;       // slug name like 'frontend'
  workspaceName: string;
  subdir?: string;
  apiKey: string;
  model: string;
  userId?: string;
  roleConfig?: RoleConfig;
  vertexConfig?: any;
  litellmConfig?: any;
  claudeSessionId?: string | null;  // for --resume
}

export function getOrCreateAgent(options: CreateAgentOptions): AgentRunner {
  let sessionAgents = registry.get(options.sessionId);
  if (!sessionAgents) {
    sessionAgents = new Map();
    registry.set(options.sessionId, sessionAgents);
  }

  const existing = sessionAgents.get(options.agentId);
  if (existing) return existing.runner;

  const workspacePath = join(getWorkspaceRoot(), options.workspaceName, options.subdir || '');

  const runner = new AgentRunner({
    sessionId: options.sessionId,
    workspacePath,
    workspaceName: options.workspaceName,
    apiKey: options.apiKey,
    model: options.model,
    vertexConfig: options.vertexConfig,
    litellmConfig: options.litellmConfig,
    userId: options.userId,
    roleConfig: options.roleConfig,
    agentId: options.agentId,
    agentDbId: options.agentDbId,
    claudeSessionId: options.claudeSessionId,
  });

  sessionAgents.set(options.agentId, { runner, agentDbId: options.agentDbId });
  return runner;
}

export function getAgent(sessionId: string, agentId: string): AgentRunner | undefined {
  return registry.get(sessionId)?.get(agentId)?.runner;
}

export function getAllAgents(sessionId: string): Map<string, AgentEntry> {
  return registry.get(sessionId) || new Map();
}

export function removeSession(sessionId: string): void {
  const agents = registry.get(sessionId);
  if (agents) {
    for (const { runner } of agents.values()) {
      runner.abort();
    }
    registry.delete(sessionId);
  }
}

export function removeAgent(sessionId: string, agentId: string): void {
  const agents = registry.get(sessionId);
  if (agents) {
    const entry = agents.get(agentId);
    if (entry) {
      entry.runner.abort();
      agents.delete(agentId);
    }
  }
}
