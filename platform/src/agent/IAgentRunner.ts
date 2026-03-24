import { EventEmitter } from 'events';

export interface IAgentRunner extends EventEmitter {
  readonly sessionId: string;
  sendMessage(message: string, thinkingBudget?: number): Promise<void>;
  abort(): void;
}
