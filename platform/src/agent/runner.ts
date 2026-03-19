import { spawn } from 'child_process';
import { EventEmitter } from 'events';
import { fileURLToPath } from 'url';
import { dirname, resolve, join } from 'path';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { createEvent } from './events.js';
import { saveEvent } from './session.js';
import { getDb } from '../db/store.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Resolve the claude CLI binary relative to this file's location
const CLAUDE_BIN = resolve(__dirname, '../../node_modules/@anthropic-ai/claude-code/cli.js');

interface VertexConfig {
  useVertex: boolean;
  projectId: string;
  region: string;
  credentialsJson: string;
}

interface RunnerOptions {
  sessionId: string;
  workspacePath: string;
  apiKey: string;
  model: string;
  sessionToken?: string;
  vertexConfig?: VertexConfig;
}

export class AgentRunner extends EventEmitter {
  private sessionId: string;
  private workspacePath: string;
  private apiKey: string;
  private model: string;
  private sessionToken: string;
  private vertexConfig: VertexConfig | undefined;
  private claudeSessionId: string | null = null;
  private subprocess: ReturnType<typeof spawn> | null = null;

  constructor(options: RunnerOptions) {
    super();
    this.sessionId = options.sessionId;
    this.workspacePath = options.workspacePath;
    this.apiKey = options.apiKey;
    this.model = options.model;
    this.sessionToken = options.sessionToken || '';
    this.vertexConfig = options.vertexConfig;

    if (!existsSync(this.workspacePath)) {
      mkdirSync(this.workspacePath, { recursive: true });
    }
  }

  async sendMessage(message: string): Promise<void> {
    const userEvent = createEvent(this.sessionId, 'user_message', { content: message });
    saveEvent(userEvent);
    this.emit('event', userEvent);

    return new Promise((resolve, reject) => {
      const args = [
        CLAUDE_BIN,
        '-p',
        '--output-format', 'stream-json',
        '--verbose',
        '--permission-mode', 'bypassPermissions',
        '--model', this.model,
        '--append-system-prompt', this.getSystemPromptAddition(),
      ];

      if (this.claudeSessionId) {
        args.push('--resume', this.claudeSessionId);
      }

      args.push(message);

      const env: Record<string, string> = { ...(process.env as any) };

      const vertexCfg = this.vertexConfig;
      if (vertexCfg?.useVertex) {
        env['CLAUDE_CODE_USE_VERTEX'] = '1';
        env['ANTHROPIC_VERTEX_PROJECT_ID'] = vertexCfg.projectId;
        env['CLOUD_ML_REGION'] = vertexCfg.region;
        delete env['ANTHROPIC_API_KEY'];

        if (vertexCfg.credentialsJson) {
          const credPath = join(tmpdir(), `srijan-sa-${this.sessionId}.json`);
          writeFileSync(credPath, vertexCfg.credentialsJson, { mode: 0o600 });
          env['GOOGLE_APPLICATION_CREDENTIALS'] = credPath;
        }
      } else {
        env['ANTHROPIC_API_KEY'] = this.apiKey;
      }

      const proc = spawn(process.execPath, args, {
        cwd: this.workspacePath,
        env,
      });

      this.subprocess = proc;
      let buffer = '';
      let stderrBuffer = '';

      proc.stderr.on('data', (chunk: Buffer) => {
        stderrBuffer += chunk.toString();
        process.stderr.write(chunk);
      });

      proc.stdout.on('data', (chunk: Buffer) => {
        buffer += chunk.toString();
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          try {
            this.handleSdkMessage(JSON.parse(trimmed));
          } catch {
            // skip non-JSON lines
          }
        }
      });

      proc.on('close', (code: number | null) => {
        if (buffer.trim()) {
          try {
            this.handleSdkMessage(JSON.parse(buffer.trim()));
          } catch {}
        }
        this.subprocess = null;
        if (code !== 0 && code !== null) {
          const detail = stderrBuffer.trim();
          console.error(`[runner] process exited code=${code}${detail ? `\n${detail}` : ''}`);
          const errEvent = createEvent(this.sessionId, 'error', {
            message: detail
              ? `Agent process exited with code ${code}: ${detail}`
              : `Agent process exited with code ${code}`,
          });
          saveEvent(errEvent);
          this.emit('event', errEvent);
        }
        resolve();
      });

      proc.on('error', (err: Error) => {
        this.subprocess = null;
        const errEvent = createEvent(this.sessionId, 'error', { message: err.message });
        saveEvent(errEvent);
        this.emit('event', errEvent);
        resolve();
      });
    });
  }

  private handleSdkMessage(msg: any): void {
    switch (msg.type) {
      case 'system': {
        if (msg.subtype === 'init' && msg.session_id) {
          this.claudeSessionId = msg.session_id;
          const event = createEvent(this.sessionId, 'session_start', {
            claudeSessionId: msg.session_id,
            tools: msg.tools || [],
          });
          saveEvent(event);
          this.emit('event', event);
        }
        break;
      }

      case 'assistant': {
        const content = msg.message?.content || [];
        for (const block of content) {
          if (block.type === 'text' && block.text) {
            const event = createEvent(this.sessionId, 'agent_response', {
              content: block.text,
              streaming: false,
              done: true,
            });
            saveEvent(event);
            this.emit('event', event);
          } else if (block.type === 'tool_use') {
            const event = createEvent(this.sessionId, 'tool_use', {
              id: block.id,
              name: block.name,
              input: block.input,
            });
            saveEvent(event);
            this.emit('event', event);
          }
        }
        break;
      }

      case 'user': {
        const content = Array.isArray(msg.message?.content) ? msg.message.content : [];
        for (const block of content) {
          if (block.type === 'tool_result') {
            const event = createEvent(this.sessionId, 'tool_result', {
              id: block.tool_use_id,
              content: Array.isArray(block.content)
                ? block.content.map((c: any) => c.text || '').join('')
                : String(block.content || ''),
              isError: block.is_error || false,
            });
            saveEvent(event);
            this.emit('event', event);
          }
        }
        break;
      }

      case 'result': {
        if (msg.is_error) {
          const event = createEvent(this.sessionId, 'error', {
            message: msg.result || 'Agent execution failed',
            subtype: msg.subtype,
          });
          saveEvent(event);
          this.emit('event', event);
        }
        break;
      }
    }
  }

  private getSystemPromptAddition(): string {
    const platformUrl = process.env.PLATFORM_URL || 'http://localhost:8080';
    const lines = [
      `Your workspace directory is: ${this.workspacePath}`,
      `Platform API base URL: ${platformUrl}`,
    ];
    if (this.sessionToken) {
      lines.push(
        `After deploying a Docker container, register the app by running:`,
        `curl -s -X POST ${platformUrl}/api/apps/register -H "Authorization: Bearer ${this.sessionToken}" -H "Content-Type: application/json" -d '{"name":"<appname>","path":"/<appname>","port":<port>}'`
      );
    }
    return lines.join('\n');
  }

  abort(): void {
    if (this.subprocess) {
      this.subprocess.kill('SIGTERM');
      this.subprocess = null;
    }
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

function getVertexConfig(): VertexConfig {
  const db = getDb();
  const row = db.prepare("SELECT value FROM config WHERE key = 'llm'").get() as { value: string } | undefined;
  if (row) {
    const config = JSON.parse(row.value);
    if (config.provider === 'vertex') {
      return {
        useVertex: true,
        projectId: config.vertexProjectId || '',
        region: config.vertexRegion || 'global',
        credentialsJson: config.vertexCredentials || '',
      };
    }
  }
  if (process.env.CLAUDE_CODE_USE_VERTEX === '1') {
    return {
      useVertex: true,
      projectId: process.env.ANTHROPIC_VERTEX_PROJECT_ID || '',
      region: process.env.CLOUD_ML_REGION || 'global',
      credentialsJson: '',
    };
  }
  return { useVertex: false, projectId: '', region: '', credentialsJson: '' };
}

export { getApiKey, getModel, getVertexConfig };
