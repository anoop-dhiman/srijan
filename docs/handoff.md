# Srijan — Agent Handoff Summary

> Date: 2026-03-20
> Latest commit: `b12441a` (git-backed workspaces with remote auth for GitHub and Azure DevOps)
> Location: `/Users/anoop.dhiman/Documents/Srijan`

---

## What is Srijan?

**Srijan** (सृजन — "creation") is a self-hosted cloud AI development environment. A user chats with an AI agent via a mobile-responsive web UI, and the agent can build apps, deploy Docker containers, configure routing, and provide live URLs — all on a single VM.

---

## Project Structure

```
Srijan/
├── docs/
│   ├── research.md          # Analysis of 5 existing solutions
│   ├── architecture.md      # Full system design with decision log
│   ├── features.md          # Feature requirements, phased roadmap
│   └── handoff.md           # This file
├── platform/
│   ├── src/
│   │   ├── server.ts        # Express entry point (:8080), WS upgrade dispatcher
│   │   ├── routes/
│   │   │   ├── auth.ts      # POST /api/auth/login, GET /api/auth/me, /auth/totp/* TOTP endpoints
│   │   │   ├── chat.ts      # WebSocket /api/chat (sessions, agent messaging, persistent forwarders)
│   │   │   ├── config.ts    # GET/PUT /api/config (LLM + system prompt settings)
│   │   │   ├── secrets.ts   # CRUD /api/secrets (AES-256 encrypted)
│   │   │   ├── apps.ts      # CRUD /api/apps (registers routes with Caddy, accepts workspace_name)
│   │   │   ├── git.ts       # Git routes: clone, init, status, pull, push, remote, credentials CRUD
│   │   │   ├── cost.ts      # GET /api/sessions/:id/cost (token usage aggregates)
│   │   │   ├── containers.ts# GET /api/containers (filtered to registered app containers)
│   │   │   ├── workspaces.ts# GET /api/workspaces (WorkspaceInfo[]), POST (create/clone + git creds)
│   │   │   ├── terminal.ts  # WS /api/terminal (node-pty PTY)
│   │   │   ├── files.ts     # GET /api/workspaces/:name/files, /file; PUT /file (Monaco save)
│   │   │   ├── sessions.ts  # GET /api/sessions/:id/recording (event replay)
│   │   │   └── users.ts     # CRUD /api/users (admin only, RBAC)
│   │   ├── agent/
│   │   │   ├── runner.ts    # AgentRunner — Claude Code CLI subprocess, Vertex AI, boundaries, cost
│   │   │   ├── IAgentRunner.ts  # Interface for pluggable agent backends
│   │   │   ├── OpenCodeRunner.ts# OpenCode stub (emits error, SDK toggle via DB key agentSdk)
│   │   │   ├── session.ts   # Session CRUD, event persistence, delete with cascade
│   │   │   └── events.ts    # Event type definitions
│   │   ├── security/
│   │   │   └── auth.ts      # bcrypt + JWT (24h expiry) + middleware
│   │   ├── docker/
│   │   │   ├── caddy.ts     # Caddy Admin API client (add/remove routes)
│   │   │   └── manager.ts   # dockerode wrapper (list, logs, stop, start)
│   │   ├── git/
│   │   │   └── manager.ts   # simple-git: clone/init/pull/push/setRemote/commitAll (all auth-aware)
│   │   ├── lib/
│   │   │   ├── crypto.ts    # AES-256-CBC encrypt/decrypt for secrets and git tokens
│   │   │   ├── gitAuth.ts   # Provider detection, auth URL injection, git_credentials DB helpers
│   │   │   └── secretProxy.ts # HTTP proxy + CONNECT relay for secret substitution
│   │   ├── db/
│   │   │   ├── store.ts     # SQLite singleton (WAL mode, auto-create dir, migrations)
│   │   │   └── schema.sql   # Tables: users, sessions, events, secrets, apps, config, token_usage, git_credentials
│   │   └── __tests__/       # 142 backend tests (vitest + supertest)
│   ├── web/                  # React frontend (separate package.json)
│   │   ├── src/
│   │   │   ├── App.tsx       # 5-tab nav (Dashboard|Chat|Files|Terminal|Settings), Dashboard as primary
│   │   │   ├── components/
│   │   │   │   ├── Chat.tsx               # Workspace switcher sidebar, session activity, replay button
│   │   │   │   ├── Dashboard.tsx          # Primary page: workspace cards, CreateWorkspacePanel, GitSection with auth
│   │   │   │   ├── Terminal.tsx           # xterm.js PTY terminal (lazy-loaded)
│   │   │   │   ├── Settings.tsx           # Sidebar nav layout: AI Provider, Agent, Security, Secrets, Users
│   │   │   │   ├── Login.tsx              # Password login + TOTP challenge step
│   │   │   │   ├── FileBrowser.tsx        # Two-panel workspace file tree + Monaco editor
│   │   │   │   └── SessionRecording.tsx   # Read-only event replay for past sessions
│   │   │   ├── hooks/
│   │   │   │   └── useChat.ts    # Per-session activity state, workspace state, WS hook
│   │   │   ├── lib/
│   │   │   │   ├── api.ts        # HTTP client with JWT, WebSocket factory, getCurrentUser()
│   │   │   │   └── utils.ts      # cn() — Tailwind class merge
│   │   │   └── __tests__/        # 124 frontend tests (vitest + RTL)
│   │   └── vite.config.ts        # Tailwind plugin, /api proxy to :8080
│   ├── Dockerfile            # Multi-stage (build + prod with docker-cli + git)
│   ├── package.json
│   ├── vitest.config.ts      # Backend test config (forks pool for SQLite)
│   └── .env.example
├── deployment/
│   ├── docker-compose.yml    # Caddy (:80/:443) + Platform (:8080)
│   ├── docker-compose.dev.yml # Dev config with hot-reload, port 2019 exposed
│   └── caddy/Caddyfile       # Base routing config
└── README.md
```

---

## Agent Architecture

The agent runs as a **Claude Code CLI subprocess** (`@anthropic-ai/claude-code`), not as an imported SDK function.

```
spawn(node, [CLAUDE_BIN, '-p', '--output-format', 'stream-json', '--verbose',
  '--permission-mode', 'bypassPermissions|default', '--model', model,
  '--append-system-prompt', systemPrompt, message])
```

Key details:
- **subprocess per message** — spawned with `spawn()`, stdin immediately closed
- **`--resume <claudeSessionId>`** — maintains conversation continuity across messages
- **Agent mode** — DB key `agentMode`: `auto` → `--permission-mode bypassPermissions`; `confirm` → `--permission-mode default`
- **Environment vars** — either `ANTHROPIC_API_KEY` (Anthropic) or `CLAUDE_CODE_USE_VERTEX=1` + `ANTHROPIC_VERTEX_PROJECT_ID` + `CLOUD_ML_REGION` (Vertex AI)
- **Vertex SA key** — if provided, written to `/tmp/srijan-sa-<sessionId>.json` with mode 0600, path set as `GOOGLE_APPLICATION_CREDENTIALS`
- **LiteLLM** — if provider is `litellm`, sets `ANTHROPIC_BASE_URL` + `ANTHROPIC_API_KEY` to route through LiteLLM proxy
- **Secret Proxy** — DB secrets decrypted at spawn time, injected as `SRIJAN_SECRET_<NAME>` env vars; HTTP proxy + CONNECT relay substitutes placeholders in outbound LLM requests
- **Agent Boundaries** — Bash tool_use requests checked against blocklist (DB key `agent_boundaries`, default hardcoded list); blocked commands return an error event
- **Cost Tracking** — `result` event → INSERT into `token_usage` table; `GET /api/sessions/:id/cost` aggregates
- **System prompt** — configurable via DB (`config` table, key `system_prompt`), falls back to `DEFAULT_SYSTEM_PROMPT`
- **Multi-SDK** — factory checks DB key `agentSdk`: `claude-code` (default) or `opencode` (stub, emits error)

### Event Flow

| subprocess JSON type | AgentEvent type | Frontend handling |
|---|---|---|
| `system` + subtype `init` | `session_start` | Shows "Connecting to agent…" status |
| `assistant` text block | `agent_response` | Renders markdown in chat bubble |
| `assistant` tool_use block | `tool_use` | Shows expandable tool pill with input |
| `user` tool_result block | `tool_result` | Updates tool pill with output/status |
| `result` with is_error | `error` | Shows error message |

---

## Background Session Streaming

Each WebSocket connection maintains a `Map<sessionId, handler>` of persistent event forwarders:

```typescript
// chat.ts
const forwarders = new Map<string, (evt: any) => void>();

function attachForwarder(sessionId: string) {
  if (forwarders.has(sessionId)) return;
  const runner = getRunner(sessionId);
  if (!runner) return;
  const handler = (evt: any) => {
    if (ws.readyState === WebSocket.OPEN)
      ws.send(JSON.stringify({ type: 'agent_event', data: evt }));
  };
  forwarders.set(sessionId, handler);
  runner.on('event', handler);
}
```

- `attachForwarder` called on `join_session` and after `new_session`/`message` creates a runner
- `detachAll()` called on `ws.on('close')` to clean up all listeners
- All sessions in a workspace continue forwarding events even when user switches to another session

---

## Git Authentication

Per-workspace credentials are stored encrypted in the `git_credentials` table. The flow:

1. Credentials stored: `saveWorkspaceCredentials(name, provider, username, token)` — token AES-256-CBC encrypted
2. At git operation time: `getWorkspaceCredentials(name)` decrypts token, builds auth URL via `buildAuthUrl(url, username, token)`
3. Auth URL used transiently: remote temporarily set to auth URL, operation runs, remote restored to clean URL
4. `.git/config` always stores clean URL (no credentials). `GIT_TERMINAL_PROMPT=0` prevents interactive prompts.
5. API never returns the token — only `{configured: bool, provider, username}` metadata

Supported providers: `github` (PAT), `azure` (Azure DevOps PAT), `generic` (any HTTPS basic auth).

---

## What Works Now

### Backend (142 tests passing)
- **Auth**: login + JWT, WebSocket auth via `?token=` query param; TOTP 2FA (setup/enable/disable/status); challenge token for login flow
- **Config**: GET/PUT for LLM settings (provider, API key, model, Vertex config, LiteLLM config), system prompt, agent mode, boundaries blocklist, agentSdk
- **Secrets**: CRUD with AES-256 encryption; injected as env vars at agent spawn via secret proxy
- **Apps**: list, register (triggers Caddy route, accepts `workspace_name`), delete (removes Caddy route)
- **Git**: clone, init, pull, push, status (with remoteUrl), set remote — all operations auth-aware
- **Git credentials**: CRUD per workspace (`GET/POST/DELETE /api/git/:name/credentials`); tokens encrypted at rest
- **Chat (WebSocket)**: create/join/list/delete sessions (with `workspace_name`), send messages, stream agent events via persistent forwarders
- **Agent runner**: Claude Code CLI subprocess with Anthropic, Vertex AI, and LiteLLM support; boundaries enforcement; cost tracking
- **Session persistence**: events stored in DB, restored on join (with JSON parsing)
- **Session recording**: `GET /api/sessions/:id/recording` returns ordered event list for replay
- **Cost tracking**: token usage INSERT on each `result` event; aggregate GET endpoint
- **Workspaces**: list with metadata; create (accepts `cloneUrl`, `remoteUrl`, `gitProvider`, `gitUsername`, `gitToken`); clone
- **File browser**: `GET /api/workspaces/:name/files?path=` (directory listing) + `/file?path=` (file content) + `PUT /file` (save)
- **Containers**: filtered to registered app containers only; optional `?workspace=` scoping
- **Terminal**: PTY via node-pty, WS at `/api/terminal?token=&sessionId=`, xterm.js on frontend
- **Users (RBAC)**: `GET/POST/DELETE /api/users` (admin only); `role` column in users table; `requireAdmin` middleware

### Frontend (124 tests passing)
- **Login**: password auth + optional TOTP challenge step; JWT stored in localStorage
- **Dashboard as primary page**: app opens to Dashboard; workspace creation lives here, not in Chat
- **Workspace creation panel**: "New Workspace" button → panel with two tabs: New Repo (name + optional remote URL + auth) and Clone Repo (URL + name + auth); auth auto-detected from URL
- **Git remote linking**: "Link Git Remote" opens a panel with URL + full auth fields (provider, username, PAT) in one step
- **Git auth on workspace cards**: auth status badge (Lock/LockOpen); configure/edit credentials inline; push from card
- **Chat UI**: responsive layout, markdown rendering, streaming cursor; replay button per session
- **Workspace switcher in Chat**: dropdown to switch between workspaces; "Create workspace in Dashboard" link replaces inline create form
- **Resizable sidebar**: drag to resize (180–480px), collapse/expand toggle button
- **Session management**: create, switch, delete; filtered to current workspace; persisted to localStorage, auto-rejoin on reload
- **Per-session activity**: spinner per session while agent runs; blue unread dot for background sessions; cleared when switching to a session
- **Cost badge**: `$X.XXXX` shown per session in sidebar when cost > 0
- **5-tab navigation**: Dashboard, Chat, Files, Terminal, Settings (Dashboard first)
- **Settings page**: sidebar navigation layout with sections: AI Provider (Anthropic/Vertex/LiteLLM), Agent (system prompt + mode + blocklist + SDK), Security (TOTP 2FA with QR code), Secrets, Users (admin only)
- **File browser**: two-panel workspace file tree + Monaco editor (edit/save/cancel)
- **Session recording**: read-only replay of past sessions; replay button in Chat sidebar
- **Dashboard**: workspace cards with session count, container count, cost, last activity; git branch + remote URL + push button; auth badge; expandable container sublist
- **Terminal**: xterm.js PTY (lazy-loaded), connected to current session's workspace
- **Real-time tool activity**: expandable pills per tool invocation with input/output details
- **Thinking indicator**: animated bouncing dots + live status text
- **Multi-user**: admin/user roles; Users section in Settings (admin only); current username shown in header

### API Routes

| Method | Route | Description |
|--------|-------|-------------|
| POST | `/api/auth/login` | Password login; returns `{token}` or `{requires_totp, challenge_token}` |
| GET | `/api/auth/me` | Current user info |
| GET | `/api/auth/totp/status` | Whether TOTP is enabled for current user |
| POST | `/api/auth/totp/setup` | Generate TOTP secret + `otpauth://` URI |
| POST | `/api/auth/totp/enable` | Verify code and activate TOTP |
| POST | `/api/auth/totp/disable` | Verify code and deactivate TOTP |
| GET | `/api/config` | All config (includes `default_system_prompt`) |
| PUT | `/api/config/:key` | Upsert config value |
| GET | `/api/secrets` | List secrets (names only) |
| POST | `/api/secrets` | Add secret |
| DELETE | `/api/secrets/:id` | Delete secret |
| GET | `/api/apps` | List deployed apps |
| POST | `/api/apps/register` | Register app + create Caddy route (accepts `workspaceName`) |
| DELETE | `/api/apps/:id` | Delete app + remove Caddy route |
| POST | `/api/git/clone` | Clone a git repo |
| POST | `/api/git/init` | Init a new repo |
| GET | `/api/git/:name/status` | Git status (branch, modified, untracked, **remoteUrl**) |
| POST | `/api/git/:name/pull` | Git pull (auto-loads workspace credentials) |
| POST | `/api/git/:name/push` | Git push (auto-loads workspace credentials) |
| POST | `/api/git/:name/remote` | Set or update origin remote URL |
| GET | `/api/git/:name/credentials` | Get credential metadata (`{configured, provider, username}`) |
| POST | `/api/git/:name/credentials` | Save credentials (`{provider, username, token}`) — token encrypted |
| DELETE | `/api/git/:name/credentials` | Remove saved credentials |
| GET | `/api/sessions/:id/cost` | Token usage aggregates for a session |
| GET | `/api/sessions/:id/recording` | Ordered event list for session replay |
| GET | `/api/containers` | List workspace-registered containers (`?workspace=name` optional) |
| GET | `/api/containers/:id/logs` | Container logs (`?tail=100`) |
| POST | `/api/containers/:id/start` | Start container |
| POST | `/api/containers/:id/stop` | Stop container |
| GET | `/api/workspaces` | List workspaces with metadata (`WorkspaceInfo[]`) |
| POST | `/api/workspaces` | Create or clone workspace (accepts `cloneUrl`, `remoteUrl`, `gitProvider`, `gitUsername`, `gitToken`) |
| GET | `/api/workspaces/:name/files` | List directory contents (`?path=` optional) |
| GET | `/api/workspaces/:name/file` | Read file content (`?path=` required) |
| PUT | `/api/workspaces/:name/file` | Write file content (`{path, content}`) |
| GET | `/api/users` | List all users (admin only) |
| POST | `/api/users` | Create user with role (admin only) |
| DELETE | `/api/users/:id` | Delete user (admin only, cannot delete self) |
| WS | `/api/chat?token=` | WebSocket for chat sessions |
| WS | `/api/terminal?token=&sessionId=` | PTY terminal WebSocket |

### WebSocket Message Types

| Client → Server | Payload | Server → Client |
|---|---|---|
| `list_sessions` | — | `sessions` |
| `new_session` | `{ workspaceName }` | `session_created` |
| `join_session` | `{ sessionId }` | `session_joined` (with events) |
| `delete_session` | `{ sessionId }` | `session_deleted` |
| `message` | `{ content }` | `agent_event` (multiple types) |
| | | `error` |

---

## DB Schema

| Table | Key columns |
|-------|------------|
| `users` | `id`, `username`, `password_hash`, `role`, `totp_secret`, `totp_enabled` |
| `sessions` | `id`, `user_id`, `title`, `status`, `workspace_name` |
| `events` | `id`, `session_id`, `type`, `data` (JSON string) |
| `secrets` | `id`, `name`, `encrypted_value` |
| `apps` | `id`, `name`, `path`, `port`, `container_id`, `workspace_name`, `status` |
| `config` | `key`, `value` |
| `token_usage` | `id`, `session_id`, `input_tokens`, `output_tokens`, `cost_usd`, `model` |
| `git_credentials` | `id`, `workspace_name` (UNIQUE), `provider`, `username`, `encrypted_token` |

---

## Config Shape (DB key: `llm`)

```json
{
  "provider": "anthropic|vertex|litellm",
  "apiKey": "sk-ant-...",
  "model": "claude-sonnet-4-6",
  "vertexProjectId": "my-project",
  "vertexRegion": "global",
  "vertexCredentials": "{ ... }",
  "litellmBaseUrl": "http://localhost:4000",
  "litellmApiKey": "sk-...",
  "litellmModel": "claude-sonnet-4-6"
}
```

Other DB config keys:
- `system_prompt` — custom agent system prompt (string)
- `agentMode` — `"auto"` | `"confirm"` (controls `--permission-mode` flag)
- `agent_boundaries` — JSON array of blocked command substrings
- `agentSdk` — `"claude-code"` (default) | `"opencode"`

---

## Architecture Decisions

- **Express 5** (not 4) — uses `path-to-regexp` v8
- **ESM modules** — `"type": "module"`, all imports use `.js` extensions
- **Vitest with forks** — `better-sqlite3` (native addon) doesn't work in worker threads
- **Frontend has its own package.json** — `platform/web/` is a separate npm project
- **Caddy in Docker** — Admin API (:2019) for dynamic route management
- **No ORM** — raw SQLite with parameterized queries
- **Claude Code as CLI subprocess** — `@anthropic-ai/claude-code` is CLI-only, no importable `query()` function
- **Dashboard as primary page** — app opens to Dashboard (activeView default = `'dashboard'`); workspace creation lives in Dashboard, not Chat; nav order: Dashboard, Chat, Files, Terminal, Settings
- **Workspace creation in Dashboard** — `CreateWorkspacePanel` with two tabs (New Repo / Clone Repo); accepts `remoteUrl` + auth for push-on-create; accepts `cloneUrl` + auth for private repo clone
- **Git credentials stored separately** — tokens never in `.git/config`; auth URL injected transiently per operation then restored to clean URL; `GIT_TERMINAL_PROMPT=0` prevents hangs
- **Settings as nav tab** — Settings is a top-level view in the 5-tab header nav, not a sidebar toggle or modal
- **Settings sidebar nav** — two-column layout: fixed `w-48` left nav selects section; sections: AI Provider, Agent, Security, Secrets, Users
- **TOTP challenge token** — login returns `{requires_totp, challenge_token}` when TOTP is enabled; challenge tokens include a `purpose` claim and are rejected by the standard `authMiddleware`
- **QR code for 2FA** — `qrcode.react` renders the `otpauth://` URI as an inline SVG with white background; manual key shown as fallback
- **Persistent WS forwarders** — background sessions keep streaming events; per-session `sessionActivity` tracks `isLoading`, `agentStatus`, `hasUnread`
- **Container filtering** — `GET /api/containers` only returns containers registered in the `apps` table
- **`currentSessionRef`** — `useRef` updated synchronously in render body to avoid stale closure issues in WS `onmessage`
- **Secret Proxy** — HTTP proxy + CONNECT relay started before subprocess spawn; substitutes `SRIJAN_SECRET_*` placeholders with real values in outbound LLM API calls; closed when process exits
- **Multi-SDK factory** — DB key `agentSdk` selects runner; `IAgentRunner` interface ensures both `AgentRunner` (Claude Code) and `OpenCodeRunner` (stub) are compatible
- **LiteLLM provider** — sets `ANTHROPIC_BASE_URL` + `ANTHROPIC_API_KEY` env vars so Claude Code CLI routes through LiteLLM proxy transparently

---

## Key Files to Read First

1. `docs/architecture.md` — full system design, data flows, security model
2. `platform/src/agent/runner.ts` — agent execution, Vertex AI, LiteLLM, secrets injection, boundaries, cost
3. `platform/src/routes/chat.ts` — WebSocket handler, persistent event forwarders, session flow
4. `platform/src/lib/gitAuth.ts` — provider detection, auth URL building, credential DB helpers
5. `platform/web/src/hooks/useChat.ts` — per-session activity state, workspace state, WS hook
6. `platform/web/src/components/Dashboard.tsx` — primary page: workspace cards, creation panel, git auth
7. `platform/web/src/components/Chat.tsx` — workspace switcher sidebar, session activity indicators
8. `platform/web/src/App.tsx` — 5-tab nav, Dashboard as default view, view routing

---

## Run Locally

```bash
cd platform
npm run dev          # Backend on :8080
cd web && npx vite   # Frontend on :5173 (proxies /api → :8080)
```
Login: username `admin`, password `admin` (or `SRIJAN_ADMIN_PASSWORD` env var).

## Run Tests

```bash
cd platform
npm test                  # 142 backend tests
cd web && npx vitest run  # 124 frontend tests
```
