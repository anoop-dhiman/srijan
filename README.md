# Srijan

**Cloud AI Development Environment** — Move your dev environment from local to cloud. Build, deploy, and manage applications through an AI coding agent, accessible from any device.

## What is Srijan?

Srijan is a self-hosted platform that runs on a single VM and provides:

- **Chat-based AI coding agent** accessible from laptop or mobile browser
- **Full Docker access** — agent can build images, run containers, deploy apps
- **Automatic routing** — deployed apps get live URLs under your domain
- **Secret protection** — API keys never exposed to the agent sandbox
- **Dual LLM provider support** — Anthropic API or Google Cloud Vertex AI
- **Real-time activity feedback** — see tool use, file edits, and commands as they happen
- **Configurable system prompt** — customize agent behavior and security rules from the UI

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
npm test                     # 56 backend tests
cd web && npx vitest run     # 56 frontend tests
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

- **Resizable sidebar** — drag to resize (180–480px), collapse/expand toggle
- **Session management** — create, switch, delete sessions; auto-restored on reload
- **Inline settings page** — full-width settings replaces chat area (not a modal)
- **Provider toggle** — switch between Anthropic API and Vertex AI (GCP) with ADC or Service Account Key
- **System prompt editor** — customize agent instructions with Reset to Default
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
| Phase 1 (MVP) | Chat UI, Claude Code agent, Docker deploy, Caddy routing, auth | **Done** |
| Phase 1.5 | Vertex AI provider, system prompt, session UX, real-time feedback | **Done** |
| Phase 2 | Multi-repo, secret proxy, agent boundaries, app dashboard | Planned |
| Phase 3 | Session snapshots, pause/resume, cost tracking | Planned |
| Phase 4 | Multi-user, local models, GitHub bot, file browser | Planned |

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19 + Vite 8 + Tailwind 4 |
| Backend | Node.js 22 + Express 5 + TypeScript 5.9 + WebSocket (ws) |
| Agent | @anthropic-ai/claude-code (CLI subprocess) |
| LLM Providers | Anthropic API, Google Cloud Vertex AI |
| Database | SQLite (better-sqlite3, WAL mode) |
| Containers | Docker Engine |
| Proxy | Caddy 2 (auto HTTPS, Admin API) |
| Auth | bcrypt + JWT (jsonwebtoken) |
| Tests | Vitest 4 + supertest + React Testing Library |

## License

TBD
