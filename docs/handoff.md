# Srijan — Agent Handoff Summary

> Date: 2026-03-19
> Commits: `4ca0ec7` (initial) → `95e562e` (MVP scaffold)
> Location: `/Users/anoop.dhiman/Documents/Srijan`

---

## What is Srijan?

**Srijan** (सृजन — "creation") is a self-hosted cloud AI development environment. A user chats with an AI agent via a mobile-responsive web UI, and the agent can build apps, deploy Docker containers, configure routing, and provide live URLs — all on a single VM.

Originally named "CloudForge" — renamed to Srijan after discovering [cloud-forge.me](https://cloud-forge.me/) (a SaaS terminal relay service) already uses that name. Our project is fundamentally different: autonomous AI agent platform vs terminal relay.

---

## Project Structure

```
Srijan/
├── docs/
│   ├── research.md          # Analysis of 5 existing solutions (OpenHands, Netclode, Coder, Daytona, Docker)
│   ├── architecture.md      # Full system design with MVP decision log
│   ├── features.md          # 30 features across 4 phases, 6 user stories, NFRs
│   └── handoff.md           # This file
├── platform/
│   ├── src/
│   │   ├── server.ts        # Express entry point (:8080)
│   │   ├── routes/
│   │   │   ├── auth.ts      # POST /api/auth/login, GET /api/auth/me
│   │   │   ├── chat.ts      # WebSocket /api/chat (sessions, agent messaging)
│   │   │   ├── config.ts    # GET/PUT /api/config (LLM settings)
│   │   │   ├── secrets.ts   # CRUD /api/secrets (AES-256 encrypted)
│   │   │   └── apps.ts      # CRUD /api/apps (registers routes with Caddy)
│   │   ├── agent/
│   │   │   ├── runner.ts    # AgentRunner — Anthropic streaming API, event emission
│   │   │   ├── session.ts   # Session CRUD, event persistence
│   │   │   └── events.ts    # Event type definitions
│   │   ├── security/
│   │   │   └── auth.ts      # bcrypt + JWT (24h expiry) + middleware
│   │   ├── docker/
│   │   │   ├── caddy.ts     # Caddy Admin API client (add/remove routes)
│   │   │   └── manager.ts   # dockerode wrapper (list, logs, stop, start)
│   │   ├── git/
│   │   │   └── manager.ts   # simple-git (clone, init, pull)
│   │   ├── db/
│   │   │   ├── store.ts     # SQLite singleton (WAL mode, auto-create dir)
│   │   │   └── schema.sql   # Tables: users, sessions, events, secrets, apps, config
│   │   └── __tests__/       # 39 backend tests (vitest + supertest)
│   ├── web/                  # React frontend (separate package.json)
│   │   ├── src/
│   │   │   ├── App.tsx       # Auth gate → Chat + Settings
│   │   │   ├── components/
│   │   │   │   ├── Chat.tsx      # Chat UI (sidebar, messages, markdown, streaming cursor)
│   │   │   │   ├── Login.tsx     # Password login
│   │   │   │   └── Settings.tsx  # LLM config + secrets management modal
│   │   │   ├── hooks/
│   │   │   │   └── useChat.ts    # WebSocket hook (sessions, streaming, reconnect)
│   │   │   ├── lib/
│   │   │   │   ├── api.ts        # HTTP client with JWT, WebSocket factory
│   │   │   │   └── utils.ts      # cn() — Tailwind class merge
│   │   │   └── __tests__/        # 7 frontend tests (vitest + RTL)
│   │   └── vite.config.ts        # Tailwind plugin, /api proxy to :8080
│   ├── Dockerfile            # Multi-stage (build + prod with docker-cli + git)
│   ├── package.json          # Scripts: dev, build, test, test:web, test:all
│   ├── vitest.config.ts      # Backend test config (forks pool for SQLite)
│   └── .env.example
├── deployment/
│   ├── docker-compose.yml    # Caddy (:80/:443) + Platform (:8080)
│   └── caddy/Caddyfile       # Base routing config
└── README.md
```

---

## MVP Decision Log

| # | Decision | Choice |
|---|----------|--------|
| 1 | Backend language | **Node.js + Express + TypeScript** |
| 2 | Agent execution | **Claude Agent SDK (programmatic)** — structured events, action interception |
| 3 | Secret handling | **Middle ground** — platform calls LLM directly; agent never holds API key |
| 4 | Agent ↔ Docker | **Hybrid** — agent runs Docker CLI naturally, platform tracks state via dockerode |
| 5 | URL routing | **Path-based** — `/forge` for platform, `/app-name` for deployed apps |
| 6 | Code structure | **Nested monorepo** — `platform/src/` + `platform/web/` |
| 7 | UI framework | **shadcn/ui** (Tailwind + Radix) |

---

## What Works Now

- **Backend API**: health, auth (login + JWT), config CRUD, secrets (AES-256 encrypt/decrypt), apps list
- **WebSocket chat**: connect, create/join/list sessions, send messages, stream responses from Anthropic API
- **Frontend**: login screen, chat UI with markdown + streaming cursor, settings modal (API key + model + secrets), session sidebar
- **Tests**: 46 total (39 backend + 7 frontend), all passing
- **Build**: `npm run dev` (backend), `cd web && npx vite` (frontend), Dockerfile builds

### Run locally
```bash
cd platform
npm run dev          # Backend on :8080
cd web && npx vite   # Frontend on :5173 (proxies /api → :8080)
```
Login: username `admin`, password `admin` (or `SRIJAN_ADMIN_PASSWORD` env var).

### Run tests
```bash
cd platform
npm test             # 39 backend tests
npm run test:web     # 7 frontend tests
npm run test:all     # Both
```

---

## What's NOT Done Yet (MVP Gaps)

### Critical for MVP
1. **Claude Agent SDK integration** — `runner.ts` currently uses raw Anthropic Messages API for chat. Needs to be replaced with `@anthropic-ai/claude-code` SDK for actual tool use (file write, bash, docker commands). This is the core feature.
2. **Agent → Docker workflow** — agent needs to actually execute bash/docker commands in the workspace, not just chat. The runner needs tool execution capability.
3. **App registration flow** — after agent deploys a container, it needs to call `POST /api/apps/register` to trigger Caddy route creation. This end-to-end flow isn't wired up.
4. **Caddy integration testing** — `caddy.ts` has the Admin API client but hasn't been tested against a real Caddy instance.
5. **Git routes** — `git/manager.ts` exists but no REST routes expose it yet.

### Important but not blocking
6. **Frontend polish** — Chat component works but could use: better error states, loading skeletons, mobile keyboard handling, session title auto-generation from first message
7. **Docker Compose local dev** — add a dev compose file that starts Caddy + Platform together
8. **Setup script** — `deployment/setup.sh` referenced in docs but not created
9. **Workspace isolation** — agent currently has access to full filesystem, needs sandboxing to `/workspaces`

---

## Architecture Decisions to Know

- **Express 5** (not 4) — uses `path-to-regexp` v8. Catch-all routes use `/{*splat}` not `*`.
- **ESM modules** — `"type": "module"` in package.json. All imports use `.js` extensions.
- **Vitest with forks** — backend tests use `pool: 'forks'` because `better-sqlite3` (native addon) doesn't work in worker threads.
- **Frontend has its own package.json** — `platform/web/` is a separate npm project with its own deps and vitest config.
- **Caddy in Docker** — reverse proxy runs as a container alongside the platform, not on the host. Uses Admin API (:2019) for dynamic route management.
- **No ORM** — raw SQLite queries via `better-sqlite3`, parameterized.

---

## Key Files to Read First

1. `docs/architecture.md` — full system design, data flows, security model, decision log
2. `docs/features.md` — MVP features, user stories, acceptance criteria
3. `platform/src/server.ts` — entry point, see how everything connects
4. `platform/src/agent/runner.ts` — agent execution (needs SDK replacement)
5. `platform/src/routes/chat.ts` — WebSocket handler, session/message flow

---

## Tech Stack Summary

| Layer | Technology |
|-------|-----------|
| Backend | Node.js 22 + Express 5 + TypeScript 5.9 |
| Frontend | React 19 + Vite 8 + Tailwind 4 + shadcn/ui |
| Database | SQLite (better-sqlite3, WAL mode) |
| Agent | Anthropic Messages API (→ migrate to Claude Agent SDK) |
| Proxy | Caddy 2 (Docker, auto HTTPS, Admin API) |
| Containers | Docker Engine + dockerode |
| Auth | bcrypt + JWT (jsonwebtoken) |
| Tests | Vitest 4 + supertest + React Testing Library |

---

## Phase Roadmap

| Phase | Focus | Status |
|-------|-------|--------|
| **Phase 1 (MVP)** | Chat UI, Claude Code agent, Docker deploy, Caddy routing, auth | **In Progress** — scaffold done, agent SDK integration pending |
| Phase 2 | Multi-LLM (LiteLLM), multi-repo, secret proxy, agent boundaries | Planned |
| Phase 3 | Session snapshots, pause/resume, cost tracking | Planned |
| Phase 4 | Multi-user, local models, GitHub bot, file browser | Planned |
