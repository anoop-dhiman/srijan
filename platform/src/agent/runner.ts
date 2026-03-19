import { EventEmitter } from 'events';
import { createEvent, AgentEvent } from './events.js';
import { saveEvent } from './session.js';
import { getDb } from '../db/store.js';

// Claude Agent SDK will be integrated here
// For now, we use the Anthropic Messages API directly as the SDK bridge

interface RunnerOptions {
  sessionId: string;
  workspacePath: string;
  apiKey: string;
  model: string;
}

export class AgentRunner extends EventEmitter {
  private sessionId: string;
  private workspacePath: string;
  private apiKey: string;
  private model: string;
  private conversationHistory: Array<{ role: string; content: string }> = [];
  private abortController: AbortController | null = null;

  constructor(options: RunnerOptions) {
    super();
    this.sessionId = options.sessionId;
    this.workspacePath = options.workspacePath;
    this.apiKey = options.apiKey;
    this.model = options.model;
  }

  async sendMessage(message: string): Promise<void> {
    // Save user message event
    const userEvent = createEvent(this.sessionId, 'user_message', { content: message });
    saveEvent(userEvent);
    this.emit('event', userEvent);

    this.conversationHistory.push({ role: 'user', content: message });

    try {
      this.abortController = new AbortController();

      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: this.model,
          max_tokens: 8192,
          system: this.getSystemPrompt(),
          messages: this.conversationHistory.map((m) => ({
            role: m.role,
            content: m.content,
          })),
          stream: true,
        }),
        signal: this.abortController.signal,
      });

      if (!response.ok) {
        const errBody = await response.text();
        throw new Error(`Anthropic API error: ${response.status} ${errBody}`);
      }

      await this.handleStream(response);
    } catch (err: any) {
      if (err.name === 'AbortError') return;
      const errorEvent = createEvent(this.sessionId, 'error', { message: err.message });
      saveEvent(errorEvent);
      this.emit('event', errorEvent);
    } finally {
      this.abortController = null;
    }
  }

  private async handleStream(response: Response): Promise<void> {
    const reader = response.body?.getReader();
    if (!reader) throw new Error('No response body');

    const decoder = new TextDecoder();
    let buffer = '';
    let fullResponse = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const data = line.slice(6).trim();
        if (data === '[DONE]') continue;

        try {
          const parsed = JSON.parse(data);

          if (parsed.type === 'content_block_delta' && parsed.delta?.text) {
            fullResponse += parsed.delta.text;
            const chunkEvent = createEvent(this.sessionId, 'agent_response', {
              content: parsed.delta.text,
              streaming: true,
            });
            this.emit('event', chunkEvent);
          }

          if (parsed.type === 'message_stop') {
            this.conversationHistory.push({ role: 'assistant', content: fullResponse });
            const doneEvent = createEvent(this.sessionId, 'agent_response', {
              content: fullResponse,
              streaming: false,
              done: true,
            });
            saveEvent(doneEvent);
            this.emit('event', doneEvent);
          }
        } catch {
          // Skip unparseable lines
        }
      }
    }
  }

  private getSystemPrompt(): string {
    return `You are Srijan, an AI coding agent running in a cloud development environment.

You have access to a workspace at: ${this.workspacePath}

You can help the user:
- Write and edit code
- Build Docker images and deploy containers
- Manage git repositories
- Debug and fix issues

When the user asks you to build and deploy an app:
1. Create the project files
2. Write a Dockerfile
3. Suggest docker commands to build and run
4. The platform will handle routing automatically

Be concise and action-oriented. Show code, not explanations unless asked.`;
  }

  abort(): void {
    this.abortController?.abort();
  }

  getHistory(): Array<{ role: string; content: string }> {
    return [...this.conversationHistory];
  }
}

// Active runners keyed by sessionId
const runners = new Map<string, AgentRunner>();

export function getOrCreateRunner(options: RunnerOptions): AgentRunner {
  let runner = runners.get(options.sessionId);
  if (!runner) {
    runner = new AgentRunner(options);
    runners.set(options.sessionId, runner);
  }
  return runner;
}

export function getRunner(sessionId: string): AgentRunner | undefined {
  return runners.get(sessionId);
}

export function removeRunner(sessionId: string): void {
  const runner = runners.get(sessionId);
  if (runner) {
    runner.abort();
    runners.delete(sessionId);
  }
}

function getApiKey(): string {
  // Platform holds the real API key — agent never sees it
  const db = getDb();
  const row = db.prepare("SELECT value FROM config WHERE key = 'llm'").get() as { value: string } | undefined;
  if (row) {
    const config = JSON.parse(row.value);
    if (config.apiKey) return config.apiKey;
  }
  return process.env.ANTHROPIC_API_KEY || '';
}

function getModel(): string {
  const db = getDb();
  const row = db.prepare("SELECT value FROM config WHERE key = 'llm'").get() as { value: string } | undefined;
  if (row) {
    const config = JSON.parse(row.value);
    if (config.model) return config.model;
  }
  return process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6';
}

export { getApiKey, getModel };
