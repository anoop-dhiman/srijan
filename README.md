# Srijan

**Cloud AI Development Environment** — Move your dev environment from local to cloud. Build, deploy, and manage applications through an AI coding agent, accessible from any device.

## What is Srijan?

Srijan is a self-hosted platform that runs on a single VM and provides:

- **Dashboard-first UX** — Dashboard is the landing page; create and manage workspaces (git repos) from there
- **Git-backed workspaces** — each workspace is a git repo; clone from GitHub/Azure DevOps or init new; push/pull from the Dashboard
- **GitHub & Azure DevOps auth** — per-workspace PAT storage (AES-256 encrypted); injected transiently at git op time, never stored in `.git/config`
- **Chat-based AI coding agent** — accessible from laptop or mobile browser; sessions scoped to a workspace
- **Full Docker access** — agent can build images, run containers, deploy apps
- **Automatic routing** — deployed apps get live URLs under your domain
- **Secret protection** — API keys decrypted at agent spawn, injected as `SRIJAN_SECRET_*` env vars, never visible to the agent
- **Multi-LLM provider support** — Anthropic API, Google Cloud Vertex AI, or LiteLLM proxy
- **Real-time activity feedback** — per-session spinner and unread indicators; background sessions continue streaming
- **Agent Boundaries** — blocklist of dangerous Bash commands enforced at the platform level
- **Confirm mode** — optional human-in-the-loop approval before agent executes actions
- **Cost tracking** — token usage and USD cost per session, shown in sidebar; monthly spending caps per user and per workspace
- **PTY terminal** — browser-based terminal (xterm.js) connected to the agent's workspace
- **File browser + editor** — Monaco editor in the browser for reading and editing workspace files

## How it Works

```
You (phone/laptop) -> https://your-domain.com/forge -> Dashboard -> Create/open workspace
                                                                              |
                                                                     Chat with AI Agent
                                                                              |
                                                                      Agent builds app
                                                                              |
                                                                      Agent deploys containers
                                                                              |
                                                           https://your-domain.com/todo <- Live app!
```

## Quick Start

### Local Development

```bash
cd platform
cp .env.example .env        # Configure ANTHROPIC_API_KEY or Vertex AI settings
npm install
npm run dev                  # Backend on :8080

cd web
npm install
npx vite                     # Frontend on :5173 (proxies /api -> :8080)
```

Login: username `admin`, password `admin` (or set `SRIJAN_ADMIN_PASSWORD` env var).

### Production (Docker)

```bash
curl -sL https://get.srijan.dev | bash -s -- \
  --domain dev.example.com \
  --email you@example.com \
  --password <admin-password>
```

Then visit `https://dev.example.com/forge` from any device.

### Run Tests

```bash
cd platform
npm test                     # 279 backend tests

cd web
npx vitest run               # 196 frontend unit tests
npx playwright test          # 22 E2E tests (requires running server)
```

## Architecture

```
+----------------------------------------------+
|  VM                                           |
|                                               |
|  Caddy (:443) --- /forge/* -> Platform (:8080)|
|   Auto HTTPS   --- /todo/*  -> Todo App (:3001)|
|   Admin API    --- /api/*   -> API Svc  (:3002)|
|                                               |
|  Platform Container                           |
|  +-- Web UI (React)                           |
|  +-- API Server (Node.js + Express)           |
|  +-- Agent Runner (Claude Code CLI subprocess)|
|  +-- Secret Proxy (HTTP+CONNECT per spawn)    |
|  +-- Docker Manager                           |
|  +-- Caddy Route Manager                      |
|  +-- Git Manager (auth-aware, simple-git)     |
|                                               |
|  App Containers (agent-deployed)              |
|  +-- todo-app + postgres                      |
|  +-- api-service                              |
|  +-- ...                                      |
+----------------------------------------------+
```

## UI Features

- **Dashboard as primary page** — opens to Dashboard on login; workspace cards show git branch, remote URL, push button
- **Workspace creation in Dashboard** — "New Workspace" panel with two tabs: New Repo (name + optional remote) and Clone Repo (URL → auto-name); both tabs support git credentials
- **Git remote linking** — link a remote and set credentials directly from a workspace card; push with one click
- **GitHub / Azure DevOps auth** — provider detection; PAT stored encrypted per workspace; edit/remove credentials from the Dashboard
- **Workspace sessions** — all sessions scoped to a workspace; background streaming; spinner/unread dot per session
- **Resizable sidebar** — drag to resize (180–480px), collapse/expand toggle
- **Session management** — create, switch, delete sessions; auto-restored on reload; cost badge per session
- **Top navigation** — Dashboard, Chat, Files, Terminal, Settings tabs
- **Terminal** — xterm.js PTY terminal in the browser connected to the current session's workspace
- **File browser + Monaco editor** — two-panel tree + in-browser code editor with save; Files tab
- **Session recording** — read-only replay of any past session; replay button in Chat sidebar
- **Settings** — two-column sidebar nav: AI Provider (Anthropic / Vertex AI / LiteLLM), Agent (system prompt, mode, blocklist, SDK), Security (TOTP 2FA with QR code), Secrets, Users (admin only)
- **Multi-user RBAC** — admin/user roles; user management in Settings; real username in header
- **TOTP 2FA** — enable/disable via Settings Security section; QR code + manual key; challenge step at login
- **Real-time tool activity** — expandable pills showing file reads, edits, bash commands with input/output details
- **Thinking indicator** — animated status showing what the agent is doing (Thinking, Reading file, Running command)
- **Theme toggle** — light/dark mode, persisted to localStorage

## Documentation

- [Architecture](docs/architecture.md) — System design, data flows, security model, roadmap
- [Features & Roadmap](docs/features.md) — Requirements, user stories, phased roadmap
- [Agent Handoff Summary](docs/handoff.md) — Current implementation status and key decisions
- [Research: Existing Solutions](docs/research.md) — Analysis of OpenHands, Netclode, Coder, Daytona, Docker Sandbox

## Roadmap

| Phase | Focus | Status |
|-------|-------|--------|
| Phase 1 (MVP) | Chat UI, Claude Code agent, Docker deploy, Caddy routing, auth, setup script | **Done** |
| Phase 2 | Multi-repo workspaces, secret proxy, agent boundaries, cost tracking, dashboard, terminal, confirm mode | **Done** |
| Phase 3 | Workspace-first UX, background session streaming, workspace metadata, per-session activity indicators | **Done** |
| Phase 4 | File browser, session recording, TOTP 2FA, multi-user RBAC, Settings sidebar nav | **Done** |
| Phase 5 | Monaco editor, LiteLLM provider, true secret proxy (HTTP+CONNECT), multi-SDK agent factory | **Done** |
| Phase 6 | Dashboard as primary page, workspace creation in Dashboard, git remote linking + push from Dashboard | **Done** |
| Phase 7 | GitHub & Azure DevOps PAT auth, per-workspace encrypted credential storage, git credential CRUD API | **Done** |
| Phase 8 | Delete workspace with cascade cleanup; disable Chat/Files when no workspaces exist | **Done** |
| Phase 9 | Comprehensive test coverage — 405 tests across 30 files | **Done** |
| Phase 10 | Security hardening — AES-256-GCM, key derivation, rate limiting, CSP, CORS, input validation (30 items) | **Done** |
| Phase 11 | Code review — P0 security (XSS, CSP, container auth), P1 reliability (reconnect caps, DB indexes, timeouts), P2 UX/a11y — 411 tests | **Done** |
| Phase 12 | Observability (pino logging, health endpoint, request tracing), workspace templates, agent permission UI, mobile polish — 447 tests | **Done** |
| Phase 13 | Production Dockerfile + CI/CD (GitHub Actions → ghcr.io), monthly spending caps, Playwright E2E tests — 497 tests | **Done** |
| Phase 14 | Local models (Ollama), GitHub bot, webhook notifications | Planned |

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19 + Vite 8 + Tailwind 4 + Monaco Editor |
| Backend | Node.js 22 + Express 5 + TypeScript 5.9 + WebSocket (ws) |
| Agent | @anthropic-ai/claude-code (CLI subprocess) |
| LLM Providers | Anthropic API, Google Cloud Vertex AI, LiteLLM proxy |
| Database | SQLite (better-sqlite3, WAL mode) |
| Git | simple-git (auth-aware; encrypted PAT per workspace) |
| Terminal | node-pty + xterm.js |
| Containers | Docker Engine + docker-compose |
| Proxy | Caddy 2 (auto HTTPS, Admin API) |
| Auth | bcrypt + JWT + TOTP (otpauth) |
| Tests | Vitest 4 + supertest + React Testing Library |

## License

MIT
