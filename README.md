# Srijan

**Cloud AI Development Environment** — Move your dev environment from local to cloud. Build, deploy, and manage applications through an AI coding agent, accessible from any device.

## What is Srijan?

Srijan is a self-hosted platform that runs on a single VM and provides:

- **Chat-based AI coding agent** accessible from laptop or mobile browser
- **Workspace-first UX** — workspaces are the primary unit; all sessions are scoped to a workspace
- **Full Docker access** — agent can build images, run containers, deploy apps
- **Automatic routing** — deployed apps get live URLs under your domain
- **Secret protection** — API keys decrypted at agent spawn, injected as `SRIJAN_SECRET_*` env vars, never visible to the agent
- **Dual LLM provider support** — Anthropic API or Google Cloud Vertex AI
- **Real-time activity feedback** — per-session spinner and unread indicators; background sessions continue streaming
- **Agent Boundaries** — blocklist of dangerous Bash commands enforced at the platform level
- **Confirm mode** — optional human-in-the-loop approval before agent executes actions
- **Cost tracking** — token usage and USD cost per session, shown in sidebar
- **PTY terminal** — browser-based terminal (xterm.js) connected to the agent's workspace

## How it Works

```
You (phone/laptop) -> https://your-domain.com/forge -> Chat with AI Agent
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
npm test                     # 121 backend tests
cd web && npx vitest run     # 112 frontend tests
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
|  +-- Docker Manager                           |
|  +-- Caddy Route Manager                      |
|                                               |
|  App Containers (agent-deployed)              |
|  +-- todo-app + postgres                      |
|  +-- api-service                              |
|  +-- ...                                      |
+----------------------------------------------+
```

## UI Features

- **Workspace-first navigation** — create a workspace first; all sessions scoped to it; switcher dropdown + inline create in sidebar
- **Background session activity** — spinner per session while agent runs; blue dot for unread updates from sessions you've switched away from
- **Resizable sidebar** — drag to resize (180–480px), collapse/expand toggle
- **Session management** — create, switch, delete sessions; auto-restored on reload; cost badge per session
- **Top navigation** — Chat, Dashboard, Terminal, Settings tabs in the main header
- **Dashboard** — workspace cards showing session count, container count, cost, last activity; expandable container sublists with logs/start/stop
- **Terminal** — xterm.js PTY terminal in the browser connected to the current session's workspace
- **Settings** — sidebar navigation layout with sections: AI Provider, Agent (system prompt + mode + blocklist), Security (TOTP 2FA with QR code), Secrets, Users (admin only)
- **File browser** — two-panel tree + viewer for workspace files (Files tab)
- **Session recording** — read-only replay of any past session with replay button in sidebar
- **Multi-user RBAC** — admin/user roles; user management in Settings; real username in header
- **TOTP 2FA** — enable/disable via Settings Security section; QR code + manual key; challenge step at login
- **Real-time tool activity** — expandable pills showing file reads, edits, bash commands with input/output details
- **Thinking indicator** — animated status showing what the agent is doing (Thinking, Reading file, Running command)
- **Markdown rendering** — code blocks, inline code, formatting in agent responses

## Documentation

- [Architecture](docs/architecture.md) — System design, data flows, security model
- [Features & Roadmap](docs/features.md) — Requirements, user stories, phased roadmap
- [Agent Handoff Summary](docs/handoff.md) — Current implementation status and key decisions
- [Research: Existing Solutions](docs/research.md) — Analysis of OpenHands, Netclode, Coder, Daytona, Docker Sandbox

## Roadmap

| Phase | Focus | Status |
|-------|-------|--------|
| Phase 1 (MVP) | Chat UI, Claude Code agent, Docker deploy, Caddy routing, auth, setup script | **Done** |
| Phase 1.5 | Vertex AI provider, system prompt, session UX, real-time feedback | **Done** |
| Phase 2 | Multi-repo workspaces, secret proxy, agent boundaries, cost tracking, dashboard, terminal, confirm mode | **Done** |
| Phase 3 | Workspace-first UX redesign, background session streaming, workspace metadata, per-session activity indicators | **Done** |
| Phase 4 | File browser, session recording, TOTP 2FA (QR code), multi-user RBAC, Settings sidebar nav redesign | **Done** |
| Phase 5 | Local models (Ollama), GitHub bot, Monaco code editor, webhook notifications | Planned |

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19 + Vite 8 + Tailwind 4 |
| Backend | Node.js 22 + Express 5 + TypeScript 5.9 + WebSocket (ws) |
| Agent | @anthropic-ai/claude-code (CLI subprocess) |
| LLM Providers | Anthropic API, Google Cloud Vertex AI |
| Database | SQLite (better-sqlite3, WAL mode) |
| Terminal | node-pty + xterm.js |
| Containers | Docker Engine |
| Proxy | Caddy 2 (auto HTTPS, Admin API) |
| Auth | bcrypt + JWT (jsonwebtoken) |
| Tests | Vitest 4 + supertest + React Testing Library |

## License

MIT
