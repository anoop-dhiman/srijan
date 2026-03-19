# Srijan — Agent Handoff Summary

> Date: 2026-03-19
> Latest commit: `a1bd544` (expandable tool messages)
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
│   ├── features.md          # 30 features across 4 phases, user stories
│   └── handoff.md           # This file
├── platform/
│   ├── src/
│   │   ├── server.ts        # Express entry point (:8080)
│   │   ├── routes/
│   │   │   ├── auth.ts      # POST /api/auth/login, GET /api/auth/me
│   │   │   ├── chat.ts      # WebSocket /api/chat (sessions, agent messaging, delete)
│   │   │   ├── config.ts    # GET/PUT /api/config (LLM + system prompt settings)
│   │   │   ├── secrets.ts   # CRUD /api/secrets (AES-256 encrypted)
│   │   │   ├── apps.ts      # CRUD /api/apps (registers routes with Caddy)
│   │   │   └── git.ts       # POST /api/git/clone, /api/git/init, GET status, POST pull
│   │   ├── agent/
│   │   │   ├── runner.ts    # AgentRunner — Claude Code CLI subprocess, Vertex AI support
│   │   │   ├── session.ts   # Session CRUD, event persistence, delete with cascade
│   │   │   └── events.ts    # Event type definitions
│   │   ├── security/
│   │   │   └── auth.ts      # bcrypt + JWT (24h expiry) + middleware
│   │   ├── docker/
│   │   │   ├── caddy.ts     # Caddy Admin API client (add/remove routes)
│   │   │   └── manager.ts   # dockerode wrapper (list, logs, stop, start)
│   │   ├── git/
│   │   │   └── manager.ts   # simple-git (clone, init, pull, status)
│   │   ├── db/
│   │   │   ├── store.ts     # SQLite singleton (WAL mode, auto-create dir)
│   │   │   └── schema.sql   # Tables: users, sessions, events, secrets, apps, config
│   │   └── __tests__/       # 56 backend tests (vitest + supertest)
│   ├── web/                  # React frontend (separate package.json)
│   │   ├── src/
│   │   │   ├── App.tsx       # Auth gate → Chat + Settings (inline)
│   │   │   ├── components/
│   │   │   │   ├── Chat.tsx      # Resizable sidebar, tool messages, thinking indicator
│   │   │   │   ├── Login.tsx     # Password login
│   │   │   │   └── Settings.tsx  # Inline settings: LLM provider, system prompt, secrets
│   │   │   ├── hooks/
│   │   │   │   └── useChat.ts    # WebSocket hook (sessions, streaming, tool events, reconnect)
│   │   │   ├── lib/
│   │   │   │   ├── api.ts        # HTTP client with JWT, WebSocket factory
│   │   │   │   └── utils.ts      # cn() — Tailwind class merge
│   │   │   └── __tests__/        # 56 frontend tests (vitest + RTL)
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
  '--permission-mode', 'bypassPermissions', '--model', model,
  '--append-system-prompt', systemPrompt, message])
```

Key details:
- **subprocess per message** — spawned with `spawn()`, stdin immediately closed
- **`--resume <claudeSessionId>`** — maintains conversation continuity across messages
- **Environment vars** — either `ANTHROPIC_API_KEY` (Anthropic) or `CLAUDE_CODE_USE_VERTEX=1` + `ANTHROPIC_VERTEX_PROJECT_ID` + `CLOUD_ML_REGION` (Vertex AI)
- **Vertex SA key** — if provided, written to `/tmp/srijan-sa-<sessionId>.json` with mode 0600, path set as `GOOGLE_APPLICATION_CREDENTIALS`
- **System prompt** — configurable via DB (`config` table, key `system_prompt`), falls back to `DEFAULT_SYSTEM_PROMPT` with security rules

### Event Flow

| subprocess JSON type | AgentEvent type | Frontend handling |
|---|---|---|
| `system` + subtype `init` | `session_start` | Shows "Connecting to agent…" status |
| `assistant` text block | `agent_response` | Renders markdown in chat bubble |
| `assistant` tool_use block | `tool_use` | Shows expandable tool pill with input |
| `user` tool_result block | `tool_result` | Updates tool pill with output/status |
| `result` with is_error | `error` | Shows error message |

---

## What Works Now

### Backend (56 tests passing)
- **Auth**: login + JWT, WebSocket auth via `?token=` query param
- **Config**: GET/PUT for LLM settings (provider, API key, model, Vertex config) and system prompt
- **Secrets**: CRUD with AES-256 encryption
- **Apps**: list, register (triggers Caddy route), delete (removes Caddy route)
- **Git**: clone, init, pull, status
- **Chat (WebSocket)**: create/join/list/delete sessions, send messages, stream agent events
- **Agent runner**: Claude Code CLI subprocess with Anthropic and Vertex AI support
- **Session persistence**: events stored in DB, restored on join (with JSON parsing)
- **Session columns**: properly aliased from snake_case to camelCase

### Frontend (56 tests passing)
- **Login**: password auth, JWT stored in localStorage
- **Chat UI**: responsive layout, markdown rendering, streaming cursor
- **Resizable sidebar**: drag to resize (180–480px), collapse/expand toggle button
- **Session management**: create, switch, delete; persisted to localStorage, auto-rejoin on reload
- **Inline settings page**: replaces chat area (not a modal), full-width
- **Provider toggle**: Anthropic API / Vertex AI (GCP) segmented control
- **Vertex fields**: Project ID, Region, optional Service Account Key textarea with show/hide
- **System prompt editor**: textarea with Save and Reset to Default
- **Secrets manager**: add/delete secrets
- **Real-time tool activity**: expandable pills per tool invocation (Read, Edit, Bash, Grep, etc.)
- **Tool details**: click to expand input params and output/result in scrollable pre blocks
- **Thinking indicator**: animated bouncing dots + live status text
- **Agent status flow**: Thinking → Reading file → Thinking → Writing → cleared

### API Routes

| Method | Route | Description |
|--------|-------|-------------|
| POST | `/api/auth/login` | Password login, returns JWT |
| GET | `/api/auth/me` | Current user info |
| GET | `/api/config` | All config (includes `default_system_prompt`) |
| PUT | `/api/config/:key` | Upsert config value (e.g., `llm`, `system_prompt`) |
| GET | `/api/secrets` | List secrets (names only) |
| POST | `/api/secrets` | Add secret |
| DELETE | `/api/secrets/:id` | Delete secret |
| GET | `/api/apps` | List deployed apps |
| POST | `/api/apps/register` | Register app + create Caddy route |
| DELETE | `/api/apps/:id` | Delete app + remove Caddy route |
| POST | `/api/git/clone` | Clone a git repo |
| POST | `/api/git/init` | Init a new repo |
| GET | `/api/git/:name/status` | Git status |
| POST | `/api/git/:name/pull` | Git pull |
| WS | `/api/chat?token=` | WebSocket for chat sessions |

### WebSocket Message Types

| Client → Server | Server → Client |
|---|---|
| `list_sessions` | `sessions` |
| `new_session` | `session_created` |
| `join_session` | `session_joined` (with events) |
| `delete_session` | `session_deleted` |
| `message` | `agent_event` (multiple types) |
| | `error` |

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

---

## Default System Prompt

Stored as `DEFAULT_SYSTEM_PROMPT` in `runner.ts`. Covers:
- Workspace isolation (stay within assigned directory)
- Security rules (never expose secrets/tokens, no arbitrary outbound requests, no privilege escalation)
- Code safety (OWASP Top 10, parameterized queries, non-root Dockerfiles)
- Deployment workflow (Docker, Caddy registration)
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
- **Settings inline, not modal** — full-width page replacing chat area for better usability

---

## Key Files to Read First

1. `docs/architecture.md` — full system design, data flows, security model
2. `platform/src/agent/runner.ts` — agent execution, Vertex AI, system prompt
3. `platform/src/routes/chat.ts` — WebSocket handler, session/message flow
4. `platform/web/src/hooks/useChat.ts` — frontend state, tool events, session persistence
5. `platform/web/src/components/Chat.tsx` — chat UI, sidebar, tool messages, thinking indicator

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
npm test             # 56 backend tests
cd web && npx vitest run  # 56 frontend tests
```
