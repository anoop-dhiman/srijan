# Srijan — Agent Handoff Summary

> Date: 2026-03-20
> Latest commit: `de4c779` (2FA QR code; Settings sidebar nav; Dashboard header removed)
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
│   │   │   ├── git.ts       # POST /api/git/clone, /api/git/init, GET status, POST pull
│   │   │   ├── cost.ts      # GET /api/sessions/:id/cost (token usage aggregates)
│   │   │   ├── containers.ts# GET /api/containers (filtered to registered app containers)
│   │   │   ├── workspaces.ts# GET /api/workspaces (WorkspaceInfo[]), POST /api/workspaces
│   │   │   ├── terminal.ts  # WS /api/terminal (node-pty PTY)
│   │   │   ├── files.ts     # GET /api/workspaces/:name/files, /file (workspace file browser)
│   │   │   ├── sessions.ts  # GET /api/sessions/:id/recording (event replay)
│   │   │   └── users.ts     # CRUD /api/users (admin only, RBAC)
│   │   ├── agent/
│   │   │   ├── runner.ts    # AgentRunner — Claude Code CLI subprocess, Vertex AI, boundaries, cost
│   │   │   ├── session.ts   # Session CRUD, event persistence, delete with cascade
│   │   │   └── events.ts    # Event type definitions
│   │   ├── security/
│   │   │   └── auth.ts      # bcrypt + JWT (24h expiry) + middleware
│   │   ├── docker/
│   │   │   ├── caddy.ts     # Caddy Admin API client (add/remove routes)
│   │   │   └── manager.ts   # dockerode wrapper (list, logs, stop, start)
│   │   ├── git/
│   │   │   └── manager.ts   # simple-git (clone, init, pull, status)
│   │   ├── lib/
│   │   │   └── crypto.ts    # AES-256-CBC encrypt/decrypt for secrets
│   │   ├── db/
│   │   │   ├── store.ts     # SQLite singleton (WAL mode, auto-create dir, migrations)
│   │   │   └── schema.sql   # Tables: users, sessions, events, secrets, apps, config, token_usage
│   │   └── __tests__/       # 76 backend tests (vitest + supertest)
│   ├── web/                  # React frontend (separate package.json)
│   │   ├── src/
│   │   │   ├── App.tsx       # 5-tab nav (Chat|Dashboard|Files|Terminal|Settings), workspace gate
│   │   │   ├── components/
│   │   │   │   ├── Chat.tsx               # Workspace switcher sidebar, session activity, replay button
│   │   │   │   ├── Dashboard.tsx          # Workspace cards with expandable container sublists
│   │   │   │   ├── Terminal.tsx           # xterm.js PTY terminal (lazy-loaded)
│   │   │   │   ├── Settings.tsx           # Sidebar nav layout: AI Provider, Agent, Security, Secrets, Users
│   │   │   │   ├── Login.tsx              # Password login + TOTP challenge step
│   │   │   │   ├── FileBrowser.tsx        # Two-panel workspace file tree + viewer
│   │   │   │   ├── SessionRecording.tsx   # Read-only event replay for past sessions
│   │   │   │   └── WorkspaceEmptyState.tsx# Fullscreen gate — "create first workspace"
│   │   │   ├── hooks/
│   │   │   │   └── useChat.ts    # Per-session activity state, workspace state, WS hook
│   │   │   ├── lib/
│   │   │   │   ├── api.ts        # HTTP client with JWT, WebSocket factory, getCurrentUser()
│   │   │   │   └── utils.ts      # cn() — Tailwind class merge
│   │   │   └── __tests__/        # 112 frontend tests (vitest + RTL)
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
- **Secret Proxy** — DB secrets decrypted at spawn time, injected as `SRIJAN_SECRET_<NAME>` env vars (never visible to agent as real keys)
- **Agent Boundaries** — Bash tool_use requests checked against blocklist (DB key `agent_boundaries`, default hardcoded list); blocked commands return an error event
- **Cost Tracking** — `result` event → INSERT into `token_usage` table; `GET /api/sessions/:id/cost` aggregates
- **System prompt** — configurable via DB (`config` table, key `system_prompt`), falls back to `DEFAULT_SYSTEM_PROMPT`

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

## What Works Now

### Backend (121 tests passing)
- **Auth**: login + JWT, WebSocket auth via `?token=` query param; TOTP 2FA (setup/enable/disable/status); challenge token for login flow
- **Config**: GET/PUT for LLM settings (provider, API key, model, Vertex config), system prompt, agent mode, boundaries blocklist
- **Secrets**: CRUD with AES-256 encryption; injected as env vars at agent spawn
- **Apps**: list, register (triggers Caddy route, accepts `workspace_name`), delete (removes Caddy route)
- **Git**: clone, init, pull, status
- **Chat (WebSocket)**: create/join/list/delete sessions (with `workspace_name`), send messages, stream agent events via persistent forwarders
- **Agent runner**: Claude Code CLI subprocess with Anthropic and Vertex AI support, boundaries enforcement, cost tracking
- **Session persistence**: events stored in DB, restored on join (with JSON parsing)
- **Session recording**: `GET /api/sessions/:id/recording` returns ordered event list for replay
- **Cost tracking**: token usage INSERT on each `result` event; aggregate GET endpoint
- **Workspaces**: list with metadata (session count, running containers, total cost, last activity); create/clone
- **File browser**: `GET /api/workspaces/:name/files?path=` (directory listing) + `/file?path=` (file content)
- **Containers**: filtered to registered app containers only; optional `?workspace=` scoping
- **Terminal**: PTY via node-pty, WS at `/api/terminal?token=&sessionId=`, xterm.js on frontend
- **Users (RBAC)**: `GET/POST/DELETE /api/users` (admin only); `role` column in users table; `requireAdmin` middleware

### Frontend (112 tests passing)
- **Login**: password auth + optional TOTP challenge step; JWT stored in localStorage
- **Workspace gate**: fullscreen empty state if no workspaces exist; must create before any chat
- **Workspace switcher**: sidebar dropdown + `+` button with inline create form; persisted to localStorage
- **Chat UI**: responsive layout, markdown rendering, streaming cursor; replay button per session
- **Resizable sidebar**: drag to resize (180–480px), collapse/expand toggle button
- **Session management**: create, switch, delete; filtered to current workspace; persisted to localStorage, auto-rejoin on reload
- **Per-session activity**: spinner per session while agent runs; blue unread dot for background sessions; cleared when switching to a session
- **Cost badge**: `$X.XXXX` shown per session in sidebar when cost > 0
- **5-tab navigation**: Chat, Dashboard, Files, Terminal, Settings in top header
- **Settings page**: sidebar navigation layout with sections: AI Provider, Agent (system prompt + mode + blocklist), Security (TOTP 2FA with QR code), Secrets, Users (admin only); "Settings" header in left panel
- **File browser**: two-panel workspace file tree + file content viewer (Files tab)
- **Session recording**: read-only replay of past sessions; replay button in Chat sidebar
- **Dashboard**: workspace cards with session count, container count, cost, last activity; expandable container sublist per workspace; Refresh button, no page heading
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
| PUT | `/api/config/:key` | Upsert config value (e.g., `llm`, `system_prompt`, `agentMode`, `agent_boundaries`) |
| GET | `/api/secrets` | List secrets (names only) |
| POST | `/api/secrets` | Add secret |
| DELETE | `/api/secrets/:id` | Delete secret |
| GET | `/api/apps` | List deployed apps |
| POST | `/api/apps/register` | Register app + create Caddy route (accepts `workspaceName`) |
| DELETE | `/api/apps/:id` | Delete app + remove Caddy route |
| POST | `/api/git/clone` | Clone a git repo |
| POST | `/api/git/init` | Init a new repo |
| GET | `/api/git/:name/status` | Git status |
| POST | `/api/git/:name/pull` | Git pull |
| GET | `/api/sessions/:id/cost` | Token usage aggregates for a session |
| GET | `/api/sessions/:id/recording` | Ordered event list for session replay |
| GET | `/api/containers` | List workspace-registered containers (`?workspace=name` optional) |
| GET | `/api/containers/:id/logs` | Container logs (`?tail=100`) |
| POST | `/api/containers/:id/start` | Start container |
| POST | `/api/containers/:id/stop` | Stop container |
| GET | `/api/workspaces` | List workspaces with metadata (`WorkspaceInfo[]`) |
| POST | `/api/workspaces` | Create or clone a workspace |
| GET | `/api/workspaces/:name/files` | List directory contents (`?path=` optional) |
| GET | `/api/workspaces/:name/file` | Read file content (`?path=` required) |
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

## WorkspaceInfo Shape (GET /api/workspaces)

```typescript
interface WorkspaceInfo {
  name: string;
  sessionCount: number;
  runningContainerCount: number;
  totalCostUsd: number | null;
  lastActivityAt: string | null;  // ISO string from latest session updated_at
}
```

---

## Config Shape (DB key: `llm`)

```json
{
  "provider": "anthropic",
  "apiKey": "sk-ant-...",
  "model": "claude-sonnet-4-6",
  "vertexProjectId": "my-project",
  "vertexRegion": "global",
  "vertexCredentials": "{ ... }"
}
```

Other DB config keys:
- `system_prompt` — custom agent system prompt (string)
- `agentMode` — `"auto"` | `"confirm"` (controls `--permission-mode` flag)
- `agent_boundaries` — JSON array of blocked command substrings

---

## Default System Prompt

Stored as `DEFAULT_SYSTEM_PROMPT` in `runner.ts`. Covers:
- Workspace isolation (stay within assigned directory)
- Security rules (never expose secrets/tokens, no arbitrary outbound requests, no privilege escalation)
- Code safety (OWASP Top 10, parameterized queries, non-root Dockerfiles)
- Deployment workflow (Docker, Caddy registration, include `workspaceName` in POST /api/apps/register)
- Communication style

Customizable via Settings → "Agent System Prompt" section. Saved to DB key `system_prompt`.

---

## Architecture Decisions

- **Express 5** (not 4) — uses `path-to-regexp` v8
- **ESM modules** — `"type": "module"`, all imports use `.js` extensions
- **Vitest with forks** — `better-sqlite3` (native addon) doesn't work in worker threads
- **Frontend has its own package.json** — `platform/web/` is a separate npm project
- **Caddy in Docker** — Admin API (:2019) for dynamic route management
- **No ORM** — raw SQLite with parameterized queries
- **Claude Code as CLI subprocess** — `@anthropic-ai/claude-code` is CLI-only, no importable `query()` function
- **Workspace-first UX** — workspaces are the primary navigation unit; a workspace must exist before any chat starts; sessions are scoped to a workspace
- **Settings as nav tab** — Settings is a top-level view in the 5-tab header nav (Chat, Dashboard, Files, Terminal, Settings), not a sidebar toggle or modal
- **Settings sidebar nav** — Settings uses a two-column layout: fixed `w-48` left nav with "Settings" header selects active section; right panel renders only that section with `max-w-5xl mx-auto` matching chat page width
- **TOTP challenge token** — login returns `{requires_totp, challenge_token}` when TOTP is enabled; challenge tokens include a `purpose` claim and are rejected by the standard `authMiddleware`
- **QR code for 2FA** — `qrcode.react` renders the `otpauth://` URI as an inline SVG with white background (scannable on dark themes); manual key shown as fallback
- **Persistent WS forwarders** — background sessions keep streaming events to the client; per-session `sessionActivity` state tracks `isLoading`, `agentStatus`, `hasUnread`
- **Container filtering** — `GET /api/containers` only returns containers registered in the `apps` table, excluding platform/caddy/unrelated containers
- **`currentSessionRef`** — a `useRef` updated synchronously in the render body to avoid stale closure issues in the WS `onmessage` handler

---

## Key Files to Read First

1. `docs/architecture.md` — full system design, data flows, security model
2. `platform/src/agent/runner.ts` — agent execution, Vertex AI, secrets injection, boundaries, cost
3. `platform/src/routes/chat.ts` — WebSocket handler, persistent event forwarders, session flow
4. `platform/web/src/hooks/useChat.ts` — per-session activity state, workspace state, WS hook
5. `platform/web/src/components/Chat.tsx` — workspace switcher sidebar, session activity indicators
6. `platform/web/src/App.tsx` — 4-tab nav, workspace gate, view routing

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
npm test                  # 121 backend tests
cd web && npx vitest run  # 112 frontend tests
```
