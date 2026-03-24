export type EventType =
  | 'user_message'
  | 'agent_response'
  | 'agent_thinking'
  | 'tool_use'
  | 'tool_result'
  | 'error'
  | 'session_start'
  | 'session_end'
  | 'agent_stopped'
  | 'plan_proposed'
  | 'role_switched'
  | 'usage_update';

export interface AgentEvent {
  id?: number;
  sessionId: string;
  type: EventType;
  data: Record<string, any>;
  createdAt?: string;
}

export function createEvent(sessionId: string, type: EventType, data: Record<string, any>): AgentEvent {
  return { sessionId, type, data };
}
