import { spawn } from 'child_process';
import { EventEmitter } from 'events';
import { fileURLToPath } from 'url';
import { dirname, resolve, join } from 'path';
import { existsSync, mkdirSync, writeFileSync, unlinkSync } from 'fs';
import { tmpdir } from 'os';
import { createEvent } from './events.js';
import { saveEvent } from './session.js';
import { getDb } from '../db/store.js';
import { decrypt } from '../lib/crypto.js';
import { startSecretProxy, type SecretMap } from './secretProxy.js';
import type { IAgentRunner } from './IAgentRunner.js';
import { OpenCodeRunner } from './OpenCodeRunner.js';
import { createLogger } from '../lib/logger.js';

const log = createLogger('runner');

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Resolve the claude CLI binary relative to this file's location
const CLAUDE_BIN = resolve(__dirname, '../../node_modules/@anthropic-ai/claude-code/cli.js');

const DEFAULT_SYSTEM_PROMPT = `You are Srijan, an AI development assistant running in a sandboxed cloud environment. You help users build, test, and deploy applications.

## Workspace
- Your assigned workspace directory is provided below. Work exclusively within it.
- Each chat session has its own isolated workspace. Never access other sessions' workspaces or parent directories.
- Do not read or modify files outside your workspace (e.g. /etc, /root, /var, host mounts).

## Capabilities
- Write, edit, and manage code files
- Run shell commands, build tools, and test suites
- Create and manage multi-container applications with Docker Compose

## Security Rules
- NEVER read, display, or log environment variables containing secrets, API keys, or tokens — including ANTHROPIC_API_KEY, GOOGLE_APPLICATION_CREDENTIALS, or any credential injected by the platform.
- NEVER expose authentication tokens, passwords, or credentials in generated code, command output, or chat responses.
- NEVER make outbound network requests to arbitrary URLs unless the user explicitly requests it. Allowed: package registries (npm, pip, etc.), Docker Hub, and the platform API.
- NEVER modify system files, platform configuration, or infrastructure outside your workspace.
- NEVER attempt to escalate privileges, escape the container sandbox, or access the host system.
- NEVER install or run cryptocurrency miners, reverse shells, or known malicious software.
- If a user asks you to do something that could compromise security, explain the risk and decline.

## Code Safety
- Sanitize all user inputs when generating code — prevent XSS, SQL injection, command injection, path traversal, and other OWASP Top 10 vulnerabilities.
- Use parameterized queries for database operations.
- Use non-root users in Dockerfiles when possible.
- Never hardcode secrets in source code — use environment variables or the platform's secrets manager.

## Deployment
- Use Docker Compose to define and manage multi-container applications.
- Name your services descriptively in docker-compose.yml; they will be prefixed with the workspace name automatically.
- Always include a Dockerfile for custom services rather than relying solely on base images.
- Use "docker compose up -d" to start services in the background and verify they are running with "docker compose ps".
- Apps run on internal ports by default. Only register an app for a public URL when the user explicitly asks for one — use the registration curl command provided in the session context.

## Communication
- Be concise and direct.
- Show relevant code snippets, not entire files unless asked.
- Explain architectural decisions when they matter.
- If something fails, diagnose the root cause before retrying.`;


interface VertexConfig {
  useVertex: boolean;
  projectId: string;
  region: string;
  credentialsJson: string;
}

interface LiteLLMConfig {
  useLiteLLM: boolean;
  baseUrl: string;
  apiKey: string;
  model: string;
}

interface RunnerOptions {
  sessionId: string;
  workspacePath: string;
  workspaceName?: string;
  apiKey: string;
  model: string;
  sessionToken?: string;
  vertexConfig?: VertexConfig;
  litellmConfig?: LiteLLMConfig;
}

export class AgentRunner extends EventEmitter implements IAgentRunner {
  readonly sessionId: string;
  private workspacePath: string;
  private workspaceName: string;
  private apiKey: string;
  private model: string;
  private sessionToken: string;
  private vertexConfig: VertexConfig | undefined;
  private litellmConfig: LiteLLMConfig | undefined;
  private claudeSessionId: string | null = null;
  private subprocess: ReturnType<typeof spawn> | null = null;

  constructor(options: RunnerOptions) {
    super();
    this.sessionId = options.sessionId;
    this.workspacePath = options.workspacePath;
    this.workspaceName = options.workspaceName || '';
    this.apiKey = options.apiKey;
    this.model = options.model;
    this.sessionToken = options.sessionToken || '';
    this.vertexConfig = options.vertexConfig;
    this.litellmConfig = options.litellmConfig;

    if (!existsSync(this.workspacePath)) {
      mkdirSync(this.workspacePath, { recursive: true });
    }
  }

  async sendMessage(message: string): Promise<void> {
    const userEvent = createEvent(this.sessionId, 'user_message', { content: message });
    saveEvent(userEvent);
    this.emit('event', userEvent);

    // Prepare secrets and start proxy before spawning subprocess
    const { envVars, secretMap } = prepareSecrets();
    const secretProxy = await startSecretProxy(secretMap);

    return new Promise((resolve, reject) => {
      const mode = getAgentMode();
      const args = [
        CLAUDE_BIN,
        '-p',
        '--output-format', 'stream-json',
        '--verbose',
        '--permission-mode', 'bypassPermissions',
        '--model', this.model,
        '--append-system-prompt', this.getSystemPromptAddition(mode),
      ];

      if (this.claudeSessionId) {
        args.push('--resume', this.claudeSessionId);
      }

      args.push(message);

      const env: Record<string, string> = { ...(process.env as any) };

      // Inject placeholders + proxy
      Object.assign(env, envVars);
      env['HTTP_PROXY'] = `http://127.0.0.1:${secretProxy.port}`;
      env['HTTPS_PROXY'] = `http://127.0.0.1:${secretProxy.port}`;

      // S9: track vertex credential temp file so it can always be cleaned up
      let vertexCredPath: string | null = null;
      const cleanupVertexCred = () => {
        if (vertexCredPath) {
          try { unlinkSync(vertexCredPath); } catch {}
          vertexCredPath = null;
        }
      };

      const vertexCfg = this.vertexConfig;
      const litellmCfg = this.litellmConfig;
      if (litellmCfg?.useLiteLLM) {
        env['ANTHROPIC_BASE_URL'] = litellmCfg.baseUrl;
        env['ANTHROPIC_API_KEY'] = litellmCfg.apiKey || 'no-key';
      } else if (vertexCfg?.useVertex) {
        env['CLAUDE_CODE_USE_VERTEX'] = '1';
        env['ANTHROPIC_VERTEX_PROJECT_ID'] = vertexCfg.projectId;
        env['CLOUD_ML_REGION'] = vertexCfg.region;
        delete env['ANTHROPIC_API_KEY'];

        if (vertexCfg.credentialsJson) {
          vertexCredPath = join(tmpdir(), `srijan-sa-${this.sessionId}.json`);
          writeFileSync(vertexCredPath, vertexCfg.credentialsJson, { mode: 0o600 });
          env['GOOGLE_APPLICATION_CREDENTIALS'] = vertexCredPath;
        }
      } else {
        env['ANTHROPIC_API_KEY'] = this.apiKey;
      }

      const proc = spawn(process.execPath, args, {
        cwd: this.workspacePath,
        env,
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      proc.stdin.end();
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

      proc.on('close', async (code: number | null) => {
        if (buffer.trim()) {
          try {
            this.handleSdkMessage(JSON.parse(buffer.trim()));
          } catch {}
        }
        this.subprocess = null;
        await secretProxy.close().catch(() => {});
        cleanupVertexCred();
        if (code !== 0 && code !== null) {
          const raw = stderrBuffer.trim();
          // S8: redact real secret values from stderr before surfacing to users
          let detail = raw;
          for (const realValue of Object.values(secretMap)) {
            if (realValue) detail = detail.replaceAll(realValue, '[REDACTED]');
          }
          log.error({ code, stderr: raw || undefined }, 'process exited with non-zero code');
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

      proc.on('error', async (err: Error) => {
        this.subprocess = null;
        runners.delete(this.sessionId);
        await secretProxy.close().catch(() => {});
        cleanupVertexCred();
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
            // Agent boundary check for Bash commands
            if (block.name === 'Bash') {
              const cmd: string = block.input?.command || '';
              // Normalize: lowercase and collapse whitespace for case-insensitive matching
              const normalizedCmd = cmd.toLowerCase().replace(/\s+/g, ' ');
              const blocked = getBoundaryBlocklist().find((p) =>
                normalizedCmd.includes(p.toLowerCase().replace(/\s+/g, ' '))
              );
              if (blocked) {
                this.subprocess?.kill('SIGKILL');
                this.subprocess = null;
                const errEvt = createEvent(this.sessionId, 'error', {
                  message: `Blocked dangerous command: "${blocked}"`,
                  blockedCommand: cmd,
                });
                saveEvent(errEvt);
                this.emit('event', errEvt);
                return;
              }
            }
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
        // Track token usage and cost
        const usage = msg.usage as { input_tokens?: number; output_tokens?: number } | undefined;
        if (usage || typeof msg.cost_usd === 'number') {
          try {
            getDb().prepare(
              `INSERT INTO token_usage (session_id, input_tokens, output_tokens, cost_usd, model)
               VALUES (?, ?, ?, ?, ?)`
            ).run(
              this.sessionId,
              usage?.input_tokens ?? 0,
              usage?.output_tokens ?? 0,
              msg.cost_usd ?? null,
              this.model,
            );
          } catch { /* non-fatal */ }
        }

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

  private getSystemPromptAddition(mode: 'auto' | 'confirm' = 'auto'): string {
    const systemPrompt = getSystemPrompt();
    const platformUrl = process.env.PLATFORM_URL || 'http://localhost:8080';
    const lines = [
      systemPrompt,
      '',
      `## Session Context`,
      `Your workspace directory is: ${this.workspacePath}`,
      `Workspace name: ${this.workspaceName || 'unknown'}`,
    ];
    if (this.sessionToken) {
      const wsJson = this.workspaceName ? `,"workspaceName":"${this.workspaceName}"` : '';
      lines.push(
        ``,
        `To give a service a public URL (only when the user explicitly requests it), register it after the container is running:`,
        `curl -s -X POST ${platformUrl}/api/apps/register -H "Authorization: Bearer ${this.sessionToken}" -H "Content-Type: application/json" -d '{"name":"<appname>","path":"/<appname>","port":<port>${wsJson}}'`,
      );
    }
    if (mode === 'confirm') {
      lines.push(
        '',
        '## Tool Approval Required',
        'You are in CONFIRMATION MODE. Before executing any tool that modifies files, runs shell commands,',
        'or makes network requests: describe what you intend to do, then end your message with',
        '[AWAITING_APPROVAL] on its own line and wait for user response.',
        '"Approved" means proceed. "Denied" means stop and ask for an alternative.',
        'Do NOT add [AWAITING_APPROVAL] for read-only operations.',
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
const runners = new Map<string, IAgentRunner>();

export function getOrCreateRunner(options: RunnerOptions): IAgentRunner {
  let runner = runners.get(options.sessionId);
  if (!runner) {
    const sdk = getAgentSdk();
    if (sdk === 'opencode') {
      runner = new OpenCodeRunner(options.sessionId);
    } else {
      runner = new AgentRunner(options);
    }
    runners.set(options.sessionId, runner);
  }
  return runner;
}

export function getRunner(sessionId: string): IAgentRunner | undefined {
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
    if (config.provider === 'litellm' && config.litellmModel) return config.litellmModel;
    if (config.model) return config.model;
  }
  return process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6';
}

function getLiteLLMConfig(): LiteLLMConfig {
  const db = getDb();
  const row = db.prepare("SELECT value FROM config WHERE key = 'llm'").get() as { value: string } | undefined;
  if (row) {
    const config = JSON.parse(row.value);
    if (config.provider === 'litellm') {
      return {
        useLiteLLM: true,
        baseUrl: config.litellmBaseUrl || '',
        apiKey: config.litellmApiKey || '',
        model: config.litellmModel || '',
      };
    }
  }
  return { useLiteLLM: false, baseUrl: '', apiKey: '', model: '' };
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

function getSystemPrompt(): string {
  const db = getDb();
  const row = db.prepare("SELECT value FROM config WHERE key = 'system_prompt'").get() as { value: string } | undefined;
  if (row) {
    const prompt = JSON.parse(row.value);
    if (typeof prompt === 'string' && prompt.trim()) return prompt;
  }
  return DEFAULT_SYSTEM_PROMPT;
}

interface SecretsResult {
  envVars: Record<string, string>;   // SRIJAN_SECRET_NAME → SRIJAN_PLACEHOLDER_name
  secretMap: SecretMap;              // SRIJAN_PLACEHOLDER_name → realValue
}

function prepareSecrets(): SecretsResult {
  const db = getDb();
  const rows = db.prepare('SELECT name, encrypted_value FROM secrets').all() as
    { name: string; encrypted_value: string }[];
  const envVars: Record<string, string> = {};
  const secretMap: SecretMap = {};
  for (const row of rows) {
    try {
      const realValue = decrypt(row.encrypted_value);
      const placeholder = `SRIJAN_PLACEHOLDER_${row.name.toLowerCase()}`;
      envVars[`SRIJAN_SECRET_${row.name}`] = placeholder;
      secretMap[placeholder] = realValue;
    } catch { /* skip malformed rows */ }
  }
  return { envVars, secretMap };
}

const DEFAULT_BLOCKLIST = [
  'rm -rf /', 'rm -rf /*',
  'docker rm srijan-', 'docker stop srijan-', 'docker kill srijan-',
  'kill -9 1', 'dd if=', 'mkfs', 'chmod -R 777 /',
];

function getBoundaryBlocklist(): string[] {
  const row = getDb().prepare("SELECT value FROM config WHERE key='agent_boundaries'").get() as any;
  if (row) {
    try {
      const v = JSON.parse(row.value);
      if (Array.isArray(v)) return v;
    } catch {}
  }
  return DEFAULT_BLOCKLIST;
}

function getAgentMode(): 'auto' | 'confirm' {
  const row = getDb().prepare("SELECT value FROM config WHERE key='agentMode'").get() as any;
  if (row) {
    try {
      const v = JSON.parse(row.value);
      if (v === 'confirm') return 'confirm';
    } catch {}
  }
  return 'auto';
}

function getAgentSdk(): 'claude-code' | 'opencode' {
  const row = getDb().prepare("SELECT value FROM config WHERE key='agentSdk'").get() as any;
  if (row) {
    try {
      const v = JSON.parse(row.value);
      if (v === 'opencode') return 'opencode';
    } catch {}
  }
  return 'claude-code';
}

export { getApiKey, getModel, getVertexConfig, getLiteLLMConfig, getSystemPrompt, DEFAULT_SYSTEM_PROMPT, getAgentMode, getAgentSdk };
export type { IAgentRunner };
