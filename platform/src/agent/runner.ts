import { spawn } from 'child_process';
import { EventEmitter } from 'events';
import { randomBytes } from 'crypto';
import { fileURLToPath } from 'url';
import { dirname, resolve, join } from 'path';
import { existsSync, mkdirSync, writeFileSync, unlinkSync } from 'fs';
import { tmpdir } from 'os';
import { createEvent } from './events.js';
import { saveEvent, updateSessionAgentClaudeId } from './session.js';
import { getDb } from '../db/store.js';
import { decrypt } from '../lib/crypto.js';
import { startSecretProxy, type SecretMap } from './secretProxy.js';
import { sendPushToSession } from '../lib/webPush.js';
import { checkSpendingLimits } from '../lib/spending.js';
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
- Always expose a host port in docker-compose.yml (e.g. "3000:3000") for any service that may need a public URL. Only register an app for a public URL when the user explicitly asks for one — use the register_app tool provided in the session context.

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

export interface RoleConfig {
  name: string;
  displayName: string;
  systemPromptAddition: string;
  allowedTools: string[] | null;  // null means all tools allowed
  subdirOverride: string;          // relative path within workspace, empty = root
}

interface RunnerOptions {
  sessionId: string;
  workspacePath: string;
  workspaceName?: string;
  apiKey: string;
  model: string;
  vertexConfig?: VertexConfig;
  litellmConfig?: LiteLLMConfig;
  userId?: string;
  roleConfig?: RoleConfig;
  agentId?: string;        // for multi-agent sessions (e.g. 'frontend', 'backend')
  agentDbId?: string;      // DB row id in session_agents table
  claudeSessionId?: string | null;  // restore prior session for --resume
  thinkingBudget?: number;  // max thinking tokens (undefined = disabled)
}

export class AgentRunner extends EventEmitter implements IAgentRunner {
  readonly sessionId: string;
  readonly agentId: string;
  private workspacePath: string;
  private workspaceName: string;
  private apiKey: string;
  private model: string;
  private registrationToken: string;
  private vertexConfig: VertexConfig | undefined;
  private litellmConfig: LiteLLMConfig | undefined;
  private claudeSessionId: string | null = null;
  private subprocess: ReturnType<typeof spawn> | null = null;
  private readonly userId: string;
  private aborted = false;
  private roleConfig: RoleConfig | undefined;
  private agentDbId: string | undefined;
  private thinkingBudget: number | undefined;

  constructor(options: RunnerOptions) {
    super();
    this.sessionId = options.sessionId;
    this.agentId = options.agentId || 'default';
    this.workspacePath = options.workspacePath;
    this.workspaceName = options.workspaceName || '';
    this.apiKey = options.apiKey;
    this.model = options.model;
    this.vertexConfig = options.vertexConfig;
    this.litellmConfig = options.litellmConfig;
    this.userId = options.userId || '';
    this.roleConfig = options.roleConfig;
    this.agentDbId = options.agentDbId;
    this.thinkingBudget = options.thinkingBudget;

    if (options.claudeSessionId) {
      this.claudeSessionId = options.claudeSessionId;
    }

    // Generate a scoped per-session token used only for app registration via MCP
    this.registrationToken = randomBytes(32).toString('hex');
    try {
      getDb().prepare('UPDATE sessions SET registration_token = ? WHERE id = ?')
        .run(this.registrationToken, this.sessionId);
    } catch { /* non-fatal */ }

    if (!existsSync(this.workspacePath)) {
      mkdirSync(this.workspacePath, { recursive: true });
    }
  }

  async sendMessage(message: string, thinkingBudget?: number): Promise<void> {
    // Spending pre-check: block spawn if limit exceeded
    if (this.userId && this.workspaceName) {
      const check = checkSpendingLimits(this.userId, this.workspaceName);
      if (!check.allowed) {
        const errEvent = createEvent(this.sessionId, 'error', { message: check.reason });
        (errEvent as any).agentId = this.agentId;
        saveEvent(errEvent);
        this.emit('event', { ...errEvent, agentId: this.agentId });
        return;
      }
    }

    const userEvent = createEvent(this.sessionId, 'user_message', { content: message });
    (userEvent as any).agentId = this.agentId;
    saveEvent(userEvent);
    this.emit('event', { ...userEvent, agentId: this.agentId });

    // Prepare secrets and start proxy before spawning subprocess
    const { envVars, secretMap } = prepareSecrets();
    const secretProxy = await startSecretProxy(secretMap);

    // Build MCP config so the agent can register apps via a scoped tool (no URL/token in prompt)
    const isTsx = __filename.endsWith('.ts');
    const mcpServerPath = join(__dirname, isTsx ? 'mcpServer.ts' : 'mcpServer.js');
    const mcpCmd = isTsx
      ? resolve(__dirname, '../../node_modules/.bin/tsx')
      : process.execPath;
    const mcpConfig = JSON.stringify({
      mcpServers: {
        srijan: {
          type: 'stdio',
          command: mcpCmd,
          args: [mcpServerPath],
          env: {
            SRIJAN_REG_TOKEN: this.registrationToken,
            SRIJAN_PLATFORM_URL: process.env.PLATFORM_URL || 'http://localhost:8080',
            SRIJAN_WORKSPACE: this.workspaceName || '',
            SRIJAN_SESSION_ID: this.sessionId,
          },
        },
      },
    });

    return new Promise((resolve, reject) => {
      const mode = getAgentMode();
      const effectiveWorkspacePath = this.roleConfig?.subdirOverride
        ? join(this.workspacePath, this.roleConfig.subdirOverride)
        : this.workspacePath;
      if (!existsSync(effectiveWorkspacePath)) {
        mkdirSync(effectiveWorkspacePath, { recursive: true });
      }
      const args = [
        CLAUDE_BIN,
        '-p',
        '--output-format', 'stream-json',
        '--verbose',
        '--permission-mode', 'bypassPermissions',
        '--model', this.model,
      ];

      const effectiveBudget = thinkingBudget ?? this.thinkingBudget;
      if (effectiveBudget && effectiveBudget > 0) {
        args.push('--max-thinking-tokens', String(effectiveBudget));
      }

      args.push(
        '--mcp-config', mcpConfig,
        '--strict-mcp-config',
        '--append-system-prompt', this.getSystemPromptAddition(mode),
      );

      if (this.roleConfig?.allowedTools && this.roleConfig.allowedTools.length > 0) {
        args.push('--allowedTools', this.roleConfig.allowedTools.join(','));
      }

      if (this.claudeSessionId) {
        args.push('--resume', this.claudeSessionId);
      }

      args.push(message);

      const env: Record<string, string> = { ...(process.env as any) };

      // Ensure SHELL is set — Claude Code CLI requires a POSIX shell
      if (!env['SHELL']) {
        env['SHELL'] = '/bin/sh';
      }

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
        const oauthToken = getOAuthToken(this.userId);
        if (oauthToken) {
          env['CLAUDE_CODE_OAUTH_TOKEN'] = oauthToken;
          delete env['ANTHROPIC_API_KEY'];
        } else {
          env['ANTHROPIC_API_KEY'] = this.apiKey;
        }
      }

      const proc = spawn(process.execPath, args, {
        cwd: effectiveWorkspacePath,
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
        if (this.aborted) {
          // User-initiated stop
          const stoppedEvent = createEvent(this.sessionId, 'agent_stopped', { message: 'Agent stopped.' });
          (stoppedEvent as any).agentId = this.agentId;
          saveEvent(stoppedEvent);
          this.emit('event', { ...stoppedEvent, agentId: this.agentId });
          this.aborted = false;
        } else if (code === 0 || code === null) {
          // Normal completion — always signal done so the frontend resets loading state
          const doneEvent = createEvent(this.sessionId, 'agent_stopped', { message: '' });
          (doneEvent as any).agentId = this.agentId;
          saveEvent(doneEvent);
          this.emit('event', { ...doneEvent, agentId: this.agentId });
          sendPushToSession(this.sessionId, { title: 'Srijan', body: 'Agent completed.' }).catch(() => {});
        } else if (code !== 0 && code !== null) {
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
          (errEvent as any).agentId = this.agentId;
          saveEvent(errEvent);
          this.emit('event', { ...errEvent, agentId: this.agentId });
          sendPushToSession(this.sessionId, { title: 'Srijan — Error', body: 'Agent exited with an error.' }).catch(() => {});
        }
        resolve();
      });

      proc.on('error', async (err: Error) => {
        this.subprocess = null;
        runners.delete(this.sessionId);
        await secretProxy.close().catch(() => {});
        cleanupVertexCred();
        const errEvent = createEvent(this.sessionId, 'error', { message: err.message });
        (errEvent as any).agentId = this.agentId;
        saveEvent(errEvent);
        this.emit('event', { ...errEvent, agentId: this.agentId });
        resolve();
      });
    });
  }

  private handleSdkMessage(msg: any): void {
    switch (msg.type) {
      case 'system': {
        if (msg.subtype === 'init' && msg.session_id) {
          this.claudeSessionId = msg.session_id;
          if (this.agentDbId) {
            updateSessionAgentClaudeId(this.agentDbId, msg.session_id);
          }
          const event = createEvent(this.sessionId, 'session_start', {
            claudeSessionId: msg.session_id,
            tools: msg.tools || [],
          });
          (event as any).agentId = this.agentId;
          saveEvent(event);
          this.emit('event', { ...event, agentId: this.agentId });
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
            (event as any).agentId = this.agentId;
            saveEvent(event);
            this.emit('event', { ...event, agentId: this.agentId });
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
                (errEvt as any).agentId = this.agentId;
                saveEvent(errEvt);
                this.emit('event', { ...errEvt, agentId: this.agentId });
                return;
              }
            }
            const event = createEvent(this.sessionId, 'tool_use', {
              id: block.id,
              name: block.name,
              input: block.input,
            });
            (event as any).agentId = this.agentId;
            saveEvent(event);
            this.emit('event', { ...event, agentId: this.agentId });
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
            (event as any).agentId = this.agentId;
            saveEvent(event);
            this.emit('event', { ...event, agentId: this.agentId });
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
              `INSERT INTO token_usage (session_id, input_tokens, output_tokens, cost_usd, model, user_id, workspace_name, agent_id)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
            ).run(
              this.sessionId,
              usage?.input_tokens ?? 0,
              usage?.output_tokens ?? 0,
              msg.cost_usd ?? null,
              this.model,
              this.userId || null,
              this.workspaceName || null,
              this.agentId,
            );
          } catch { /* non-fatal */ }
        }

        // Emit usage_update event so the frontend can update cumulative token counts live
        const usageEvent = createEvent(this.sessionId, 'usage_update', {
          inputTokens: usage?.input_tokens ?? 0,
          outputTokens: usage?.output_tokens ?? 0,
          costUsd: msg.cost_usd ?? null,
          model: this.model,
        });
        (usageEvent as any).agentId = this.agentId;
        saveEvent(usageEvent);
        this.emit('event', { ...usageEvent, agentId: this.agentId });

        if (msg.is_error) {
          const event = createEvent(this.sessionId, 'error', {
            message: msg.result || 'Agent execution failed',
            subtype: msg.subtype,
          });
          (event as any).agentId = this.agentId;
          saveEvent(event);
          this.emit('event', { ...event, agentId: this.agentId });
        }
        break;
      }
    }
  }

  private getSystemPromptAddition(mode: 'auto' | 'confirm' = 'auto'): string {
    const systemPrompt = getSystemPrompt();
    const lines = [
      systemPrompt,
      '',
      `## Session Context`,
      `Your workspace directory is: ${this.workspacePath}`,
      `Workspace name: ${this.workspaceName || 'unknown'}`,
      '',
      `## Public URLs`,
      `To give a running service a public URL (only when the user explicitly requests it), use the register_app tool after the container is running:`,
      `1. Ensure the service exposes a host port in docker-compose.yml (e.g. "3000:3000" under ports).`,
      `2. Call: mcp__srijan__register_app with arguments: name=<appname> port=<host_port> path=/<appname>`,
      `   - port is the HOST-mapped port (left side of the -p / ports mapping, e.g. 3000 for "3000:3000").`,
      `   - Do NOT use the container-internal port if it differs from the host port.`,
    ];
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
    if (this.roleConfig?.systemPromptAddition) {
      lines.push('', this.roleConfig.systemPromptAddition);
    }
    return lines.join('\n');
  }

  abort(): void {
    if (this.subprocess) {
      this.aborted = true;
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

export function getOAuthToken(userId: string): string | null {
  if (!userId) return null;
  try {
    const row = getDb().prepare(
      'SELECT encrypted_access_token, expires_at FROM user_oauth_tokens WHERE user_id = ?'
    ).get(userId) as { encrypted_access_token: string; expires_at: number | null } | undefined;
    if (!row) return null;
    // Check expiry (5 min buffer)
    if (row.expires_at && row.expires_at < Date.now() + 5 * 60 * 1000) return null;
    return decrypt(row.encrypted_access_token);
  } catch {
    return null;
  }
}

export { getApiKey, getModel, getVertexConfig, getLiteLLMConfig, getSystemPrompt, DEFAULT_SYSTEM_PROMPT, DEFAULT_BLOCKLIST, getAgentMode, getAgentSdk };
export type { IAgentRunner };
