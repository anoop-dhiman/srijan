import { EventEmitter } from 'events';
import type { IAgentRunner } from './IAgentRunner.js';
import { createEvent } from './events.js';
import { saveEvent } from './session.js';

export class OpenCodeRunner extends EventEmitter implements IAgentRunner {
  readonly sessionId: string;

  constructor(sessionId: string) {
    super();
    this.sessionId = sessionId;
  }

  // STUB: OpenCode SDK integration is not yet implemented.
  // Switch to 'claude-code' in Settings > Agent to use the working runner.
  async sendMessage(_message: string): Promise<void> {
    const event = createEvent(this.sessionId, 'error', {
      message: 'OpenCode SDK is not yet implemented. Please switch to the Claude Code SDK in Settings > Agent.',
    });
    try { saveEvent(event); } catch { /* session may not exist in test context */ }
    this.emit('event', event);
  }

  abort(): void {}
}
