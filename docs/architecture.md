# Srijan - Architecture Design

> Version: 0.3.0
> Date: 2026-03-19
> Status: Current

---

## Vision

Srijan is a self-hosted cloud AI development environment that runs on a single VM, accessible from any device (laptop or mobile) via a web browser. An AI coding agent can build applications, deploy them as Docker containers, configure routing, and provide live URLs -- all through a chat interface.

## Core Principles

1. **Simple deployment** -- single shell script to set up on any VM
2. **Mobile-first UI** -- responsive web chat that works on phones
3. **Agent autonomy** -- agent can build, deploy, and route apps independently
4. **Security by default** -- secrets never exposed to agent sandbox
5. **Lightweight** -- runs on a single VM (2-4 vCPU, 4-8GB RAM)
6. **Pluggable agents** -- support Claude Code, OpenCode, Codex, etc.

---

## High-Level Architecture

```
                          Internet
                             |
                    +--------+--------+
                    |  Caddy (Docker) |  :443/:80
                    |  Auto HTTPS     |
                    |  Admin API :2019|
                    +--------+--------+
                             |
          +------------------+------------------+
          |                  |                  |
    /forge/*           /app1/*            /app2/*
          |                  |                  |
  +-------+-------+  +------+------+   +-------+------+
  | Platform       |  | App 1       |   | App 2        |
  | Container      |  | Container   |   | Container    |
  | :8080          |  | :3001       |   | :3002        |
  +----------------+  +-------------+   +--------------+
          |
          |  Docker Socket (mounted)
          |
  +-------+-------+
  |  Host Docker   |
  |  Daemon        |
  +----------------+
```

**Why Caddy over Nginx?**
- **Automatic HTTPS** -- just set the domain, SSL certs are provisioned and renewed automatically (no certbot)
- **Admin REST API** -- add/remove routes dynamically without config files or reloads
- **Single container** -- replaces both Nginx + Certbot
- **Zero-downtime updates** -- API-driven config changes are atomic

---

## Component Architecture

### 1. Host Layer (VM)

The bare metal/VM runs:
- **Docker Engine** -- runs all containers (Caddy, platform, apps)
- **Setup script** -- bootstraps everything

```
VM (Ubuntu 22.04+)
+-- /opt/srijan/
|   +-- config.yml               # Platform configuration
|   +-- secrets.enc              # Encrypted secrets vault
|   +-- workspaces/              # Git repos / project files
|   +-- data/                    # Platform state (SQLite)
|   +-- caddy/
|       +-- Caddyfile            # Base Caddy config (optional, API-driven)
|       +-- data/                # Caddy TLS certs, OCSP staples
|       +-- config/              # Caddy auto-generated config
+-- Docker containers (Caddy, Platform, Apps)
```

### 2. Platform Container (The Brain)

Single Docker container that runs the entire platform:

```
Platform Container (:8080)
+-- API Server (Node.js / FastAPI)
|   +-- /api/auth          # Login, session management
|   +-- /api/chat          # Agent chat (WebSocket)
|   +-- /api/config        # LLM, agent, git settings
|   +-- /api/secrets       # Secret management (CRUD)
|   +-- /api/repos         # Git repository management
|   +-- /api/apps          # Deployed app management
|   +-- /api/events        # Event stream (SSE)
|
+-- Web UI (React/Vite)
|   +-- Chat interface
|   +-- Settings panel
|   +-- App dashboard
|   +-- Repo manager
|
+-- Agent Runner
|   +-- SDK Manager (Claude, OpenCode, Codex)
|   +-- Session Manager (create, pause, resume)
|   +-- Event Stream (typed events)
|   +-- PTY Manager (terminal sessions via node-pty)
|
+-- Secret Proxy
|   +-- Placeholder injector (outbound HTTP intercept)
|   +-- Allowed hosts whitelist
|
+-- Docker Manager
|   +-- Build images
|   +-- Run/stop containers
|   +-- Read logs
|   +-- Network management
|
+-- Caddy Route Manager
|   +-- Add/remove routes via Caddy Admin API (:2019)
|   +-- Track app -> port mappings
|
+-- State Store (SQLite)
    +-- Sessions
    +-- Events
    +-- Secrets (encrypted)
    +-- Apps
    +-- Repos
    +-- Snapshots
```

### 3. Agent Sandbox

The agent runs inside the platform container but with restricted access:

```
Agent Sandbox (within platform container)
+-- Workspace: /workspaces/<repo-name>/
+-- Tools available:
|   +-- bash (filtered through Agent Boundaries)
|   +-- docker CLI (via mounted socket, filtered)
|   +-- git
|   +-- file read/write (sandboxed to /workspaces)
|   +-- caddy route management (via Admin API)
+-- Environment:
|   +-- SRIJAN_PLACEHOLDER_ANTHROPIC_KEY=placeholder_xxx
|   +-- SRIJAN_PLACEHOLDER_OPENAI_KEY=placeholder_xxx
|   +-- GIT_TOKEN=<scoped token>
|   +-- WORKSPACE_ROOT=/workspaces
+-- Restrictions:
    +-- Cannot read /opt/srijan/secrets.enc
    +-- Cannot access host filesystem outside /workspaces
    +-- Docker commands filtered (no --privileged, no host network)
    +-- Destructive commands blocked (rm -rf /, docker rm platform, etc.)
```

---

## Data Flow

### Chat Flow (User -> Agent -> Action)

```
User (browser)
  |
  | WebSocket: /api/chat
  v
API Server
  |
  | Event: user_message
  v
Agent Runner
  |
  +-- Sends to LLM (via LiteLLM)
  |   +-- Secret Proxy intercepts outbound HTTP
  |   +-- Replaces SRIJAN_PLACEHOLDER_* with real keys
  |
  | LLM responds with action
  v
Action Executor
  |
  +-- FileWrite    -> write to /workspaces/...
  +-- BashCommand  -> Agent Boundaries filter -> execute
  +-- DockerBuild  -> docker build via socket
  +-- DockerRun    -> docker run via socket -> register app
  +-- CaddyRoute   -> POST to Caddy Admin API -> route active
  +-- GitOperation -> git clone/commit/push
  |
  | Event: observation (result)
  v
Agent Runner
  |
  | Event: agent_response
  v
API Server
  |
  | WebSocket: response
  v
User (browser)
```

### App Deployment Flow (Todo App Example)

```
User: "Build a todo app with postgres and auth"
  |
  v
Agent:
  1. git init /workspaces/todo-app/
  2. Scaffold backend (Node.js + Express)
  3. Scaffold frontend (React)
  4. Write Dockerfile
  5. Write docker-compose.yml (app + postgres)
  6. docker compose build
  7. docker compose up -d
     -> app on :3001, postgres on :5432 (internal)
  8. POST /api/apps/register
     {name: "todo", port: 3001, path: "/todo"}
  9. Caddy Route Manager calls Caddy Admin API:
     POST http://caddy:2019/config/apps/http/servers/srv0/routes
     -> adds reverse_proxy to todo-app:3001
  10. Route active instantly (no reload needed)
  11. Returns: "App live at https://domain.com/todo"
```

---

## Security Architecture

### Secret Proxy (Netclode-inspired)

```
+---------------------------------------------+
| Platform Container                           |
|                                              |
|  Agent sees:                                 |
|    ANTHROPIC_API_KEY=SRIJAN_PH_abc123    |
|                                              |
|  +----------------------------+              |
|  | Secret Proxy (outbound)    |              |
|  |                            |              |
|  | Intercepts HTTP requests   |              |
|  | to allowed hosts:          |              |
|  |  - api.anthropic.com       |              |
|  |  - openai.azure.com        |              |
|  |  - *.googleapis.com        |              |
|  |                            |              |
|  | Replaces placeholder       |              |
|  | headers/body with real     |              |
|  | API keys from vault        |              |
|  |                            |              |
|  | Blocks requests to         |              |
|  | non-whitelisted hosts      |              |
|  | that contain placeholders  |              |
|  +----------------------------+              |
|                                              |
|  Real keys stored in:                        |
|  /opt/srijan/secrets.enc (AES-256)       |
|  Only Secret Proxy process can read          |
+----------------------------------------------+
```

### Agent Boundaries (Coder-inspired)

Blocked patterns:
- `rm -rf /` (outside workspaces)
- `docker rm` on platform container
- `docker run --privileged`
- `docker run --network host`
- Accessing secrets.enc
- Reading /etc/shadow
- shutdown/reboot/halt
- iptables/ufw manipulation

Allowed Docker operations:
- build, run, stop, start, logs, ps, images, compose, exec

### Authentication

```
Browser -> Caddy (HTTPS, auto-TLS) -> Platform API
                              |
                              +-- Password auth (bcrypt hash)
                              +-- JWT session token (24h expiry)
                              +-- Optional: TOTP 2FA (v2)
```

---

## MVP Decision Log

| # | Decision | Choice | Rationale |
|---|----------|--------|-----------|
| 1 | Backend language | Node.js + Express + TypeScript | Single language across stack, native Claude SDK, WebSocket support |
| 2 | Agent execution | Claude Code CLI subprocess | `@anthropic-ai/claude-code` is CLI-only — spawned via `spawn()` with `--output-format stream-json --verbose` |
| 3 | Secret handling | Middle ground | Platform calls LLM directly; agent never holds API key. Full proxy in Phase 2 |
| 4 | Agent ↔ Docker | Hybrid | Agent runs Docker CLI (natural workflow), platform tracks state via dockerode |
| 5 | URL routing | Path-based | `/forge` for platform, `/app-name` for apps. Single DNS record, no wildcard needed |
| 6 | Code structure | Nested monorepo | `platform/src/` (backend) + `platform/web/` (frontend). Single package.json, single Dockerfile |
| 7 | UI framework | shadcn/ui (Tailwind + Radix) | Lightweight, accessible components, mobile-first utilities, no framework lock-in |

---

## Tech Stack

### Platform Container

| Component | Technology | Rationale |
|-----------|-----------|-----------|
| API Server | **Node.js + Express + TypeScript** | Single language across stack, native WebSocket support |
| Web UI | **React + Vite + shadcn/ui** | Tailwind utilities for mobile-first, Radix for accessibility |
| Agent | **@anthropic-ai/claude-code** (CLI subprocess) | Spawned via `spawn()`, stream-json output, `--verbose`, `--permission-mode bypassPermissions` |
| LLM Providers | **Anthropic API** or **Google Cloud Vertex AI** | Configured via UI; Vertex supports ADC and Service Account Key auth |
| State Store | **SQLite** (via better-sqlite3) | Zero-config, single-file DB |
| Terminal | **node-pty + xterm.js** (Phase 2) | PTY for agent, xterm.js for browser |
| Docker Client | **dockerode** | App state tracking, port management, Caddy route registration |
| Git | **simple-git** | Git operations from API |

### Host Layer

| Component | Technology | Rationale |
|-----------|-----------|-----------|
| Reverse Proxy + SSL | **Caddy** (Docker container) | Auto HTTPS, Admin REST API for dynamic routing, no certbot needed |
| Container Runtime | **Docker Engine** | Standard, widely available |
| OS | **Ubuntu 22.04+ / Debian 12+** | Stable, well-supported |

---

## Web UI Design

### Layout (Mobile-First)

```
+----------------------------------------------------------+
|  Srijan   [Chat] [Dashboard] [Terminal] [Settings]        |
|           ● Connected  admin  [Logout]                    |
+----------------------------------------------------------+
| [◀] SIDEBAR  |  MAIN AREA (Chat / Dashboard / Terminal / |
|              |  Settings based on active tab)             |
|  Workspace   |                                            |
|  [my-app  v] [+]                                         |
|              |  > Build me a todo app                     |
|  [+ New Chat]|                                            |
|  ──────────  |  ✓ Reading package.json                   |
|  Session 1 ⟳ |  ✓ Editing src/index.ts                   |
|  Session 2 🔵 |  ● Running: npm install  (spinner)        |
|  Session 3   |                                            |
|              |  ● ● ● Thinking...                        |
|              |                                            |
|              |  Agent: Here's what I built...             |
|              |  (markdown rendered)                       |
|              |                                            |
|              |  +----------------------------------+      |
|              |  | Type a message...           [▶]  |      |
|              |  +----------------------------------+      |
+----------------------------------------------------------+
```

- Header: 4-tab nav (Chat, Dashboard, Terminal, Settings) + connection status + logout
- Sidebar: resizable (180–480px), collapsible via toggle button
- Workspace switcher: dropdown (select) + `+` button → inline create form
- Session list: filtered to current workspace; ⟳ = agent running, 🔵 = unread update
- Tool pills: expandable to show input/output details
- Thinking indicator: animated dots + live status text

### Settings Page (Top-level view — replaces main area when Settings tab active)

```
+------------------------------------------+
|  Settings                                 |
+------------------------------------------+
|                                           |
|  LLM PROVIDER                             |
|  +-------------------------------------+ |
|  | [Anthropic API] [Vertex AI (GCP)]   | |  <- segmented toggle
|  |                                      | |
|  | IF Anthropic:                        | |
|  |   API Key: [sk-ant-... eye]          | |
|  | IF Vertex:                           | |
|  |   Project ID: [my-gcp-project]       | |
|  |   Region: [global]                   | |
|  |   SA Key (optional): [textarea eye]  | |
|  |   i  Leave blank to use gcloud ADC   | |
|  |                                      | |
|  | Model: [Claude Sonnet 4.6 v]         | |
|  | [Save]                               | |
|  +-------------------------------------+ |
|                                           |
|  AGENT SYSTEM PROMPT                      |
|  +-------------------------------------+ |
|  | [editable textarea, monospaced]      | |
|  | You are Srijan, an AI development... | |
|  +-------------------------------------+ |
|  | [Save Prompt]  [Reset to Default]    | |
|                                           |
|  SECRETS                                  |
|  +-------------------------------------+ |
|  | MY_SECRET                     [trash]| |
|  | [Name] [Value] [+]                   | |
|  +-------------------------------------+ |
|                                           |
|  SECURITY                                 |
|  +-------------------------------------+ |
|  | Agent Mode: [Auto] [Confirm]         | |
|  | Boundaries (blocked commands):       | |
|  | [rm -rf /]  [shutdown]  [...]        | |
|  +-------------------------------------+ |
+------------------------------------------+
```

### Dashboard (Workspace Cards)

```
+------------------------------------------+
|  Dashboard                    [Refresh]   |
+------------------------------------------+
|  my-react-app           [Active]          |
|  3 sessions  2 containers  $0.024         |
|  Last active: 2 hours ago                 |
|  [View Sessions]  [Show Containers v]     |
|    todo-web  [running]  [Logs] [Stop]     |
|    postgres  [running]  [Logs] [Stop]     |
+------------------------------------------+
|  api-service            [Idle]            |
|  1 session   0 containers  $0.012         |
|  Last active: yesterday                   |
|  [View Sessions]  [Show Containers v]     |
+------------------------------------------+
```

---

## Configuration

### Platform Config (`/opt/srijan/config.yml`)

```yaml
# Srijan Configuration
server:
  domain: dev.example.com
  port: 8080
  session_ttl: 24h

auth:
  password_hash: "$2b$12$..."   # bcrypt
  totp_enabled: false

llm:
  provider: anthropic             # anthropic | azure | vertex | openai
  anthropic:
    model: claude-sonnet-4-6
    # api_key stored in secrets vault, not here
  azure:
    endpoint: https://my-resource.openai.azure.com
    deployment: gpt-4o
    api_version: "2024-12-01-preview"
  vertex:
    project_id: my-gcp-project
    location: us-central1
    model: claude-sonnet-4@latest

agent:
  backend: claude-code            # claude-code | opencode | codex
  auto_approve: false             # yolo mode
  max_concurrent: 1
  workspace_root: /workspaces
  boundaries:
    enabled: true
    block_destructive: true
    docker_whitelist:
      - build
      - run
      - stop
      - start
      - logs
      - ps
      - compose

repos: []
  # Managed via UI/API
  # - name: todo-app
  #   url: git@github.com:user/todo-app.git
  #   branch: main

apps: []
  # Auto-populated by agent
  # - name: todo
  #   path: /todo
  #   port: 3001
  #   container: todo-app-web-1
  #   status: running

secrets:
  proxy:
    allowed_hosts:
      - api.anthropic.com
      - "*.openai.azure.com"
      - "*.googleapis.com"
      - api.openai.com
      - "*.github.com"
```

---

## Deployment

### Setup Script (`setup.sh`)

```bash
#!/bin/bash
# Srijan - One-line setup
# Usage: curl -sL https://get.srijan.dev | bash -s -- \
#          --domain dev.example.com \
#          --email you@example.com \
#          --password <admin-password>

set -euo pipefail

# 1. Install Docker (if not present)
# 2. Create srijan user and directories
# 3. Generate config.yml with domain, password hash
# 4. Write Caddyfile with domain and /forge route
# 5. docker compose up -d (Caddy + Platform)
# 6. Caddy auto-provisions SSL certificate
# 7. Print access URL
```

### Docker Compose (Platform)

```yaml
version: "3.8"
services:
  caddy:
    image: caddy:2-alpine
    container_name: srijan-caddy
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"
      - "443:443/udp"   # HTTP/3
    volumes:
      - /opt/srijan/caddy/Caddyfile:/etc/caddy/Caddyfile:ro
      - /opt/srijan/caddy/data:/data       # TLS certs
      - /opt/srijan/caddy/config:/config   # Auto-generated config
    environment:
      - SRIJAN_DOMAIN=${SRIJAN_DOMAIN}

  srijan:
    image: srijan/platform:latest
    container_name: srijan-platform
    restart: unless-stopped
    expose:
      - "8080"
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock  # Docker access
      - /opt/srijan/workspaces:/workspaces      # Persistent workspaces
      - /opt/srijan/data:/data                   # SQLite, state
      - /opt/srijan/config.yml:/config.yml:ro    # Config
      - /opt/srijan/secrets.enc:/secrets.enc:ro  # Encrypted secrets
    environment:
      - SRIJAN_CONFIG=/config.yml
      - SRIJAN_DATA_DIR=/data
      - SRIJAN_SECRETS_FILE=/secrets.enc
      - SRIJAN_SECRETS_KEY=${SECRETS_ENCRYPTION_KEY}
      - CADDY_ADMIN_URL=http://caddy:2019          # For dynamic route management
    depends_on:
      - caddy
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8080/health"]
      interval: 30s
      timeout: 10s
      retries: 3
```

---

## Project Directory Structure

```
Srijan/
+-- README.md
+-- docs/
|   +-- research.md              # Existing solutions analysis
|   +-- architecture.md          # This document
|   +-- features.md              # Feature requirements & roadmap
+-- platform/
|   +-- Dockerfile
|   +-- package.json
|   +-- src/
|   |   +-- server.ts            # Express API server, WS upgrade dispatcher
|   |   +-- routes/
|   |   |   +-- auth.ts
|   |   |   +-- chat.ts          # WebSocket handler (persistent per-session forwarders)
|   |   |   +-- config.ts        # GET/PUT config (exposes default_system_prompt)
|   |   |   +-- secrets.ts
|   |   |   +-- apps.ts          # register accepts workspace_name
|   |   |   +-- git.ts
|   |   |   +-- cost.ts          # GET /api/sessions/:id/cost
|   |   |   +-- containers.ts    # Filtered to registered app containers
|   |   |   +-- workspaces.ts    # WorkspaceInfo[] with metadata
|   |   |   +-- terminal.ts      # WS PTY (node-pty)
|   |   +-- agent/
|   |   |   +-- runner.ts        # Claude Code CLI subprocess, Vertex AI, boundaries, cost
|   |   |   +-- events.ts        # Event type definitions
|   |   |   +-- session.ts       # Session CRUD, event persistence, delete with cascade
|   |   +-- security/
|   |   |   +-- auth.ts          # JWT + password auth + middleware
|   |   +-- docker/
|   |   |   +-- manager.ts       # Container lifecycle (dockerode)
|   |   |   +-- caddy.ts         # Caddy Admin API client
|   |   +-- git/
|   |   |   +-- manager.ts       # Git operations (simple-git)
|   |   +-- lib/
|   |   |   +-- crypto.ts        # AES-256-CBC encrypt/decrypt
|   |   +-- db/
|   |   |   +-- store.ts         # SQLite singleton (WAL mode, migrations)
|   |   |   +-- schema.sql       # Tables: users, sessions, events, secrets, apps, config, token_usage
|   |   +-- __tests__/           # 76 backend tests
|   +-- web/                      # React frontend (separate package.json)
|       +-- index.html
|       +-- vite.config.ts
|       +-- src/
|           +-- App.tsx           # 4-tab nav, workspace gate, view routing
|           +-- components/
|           |   +-- Chat.tsx              # Workspace switcher, session activity indicators
|           |   +-- Dashboard.tsx         # Workspace cards with container sublists
|           |   +-- Terminal.tsx          # xterm.js PTY (lazy-loaded)
|           |   +-- Settings.tsx          # LLM, system prompt, secrets, agent mode, boundaries
|           |   +-- Login.tsx             # Password login
|           |   +-- WorkspaceEmptyState.tsx  # Fullscreen create-first-workspace gate
|           +-- hooks/
|           |   +-- useChat.ts    # Per-session activity state, workspace state, WS hook
|           +-- lib/
|           |   +-- api.ts        # HTTP client with JWT, WebSocket factory
|           |   +-- utils.ts      # cn() — Tailwind class merge
|           +-- __tests__/        # 76 frontend tests
+-- deployment/
|   +-- setup.sh                 # One-line setup script
|   +-- docker-compose.yml       # Caddy + Platform compose
|   +-- caddy/
|   |   +-- Caddyfile            # Base Caddy config (domain + /forge route)
|   +-- systemd/
|       +-- srijan.service
+-- scripts/
    +-- build.sh
    +-- dev.sh
    +-- test.sh
```

---

## Roadmap

### Phase 1: MVP (v0.1) — DONE
- [x] Platform container with API server
- [x] Password auth + JWT sessions
- [x] Chat UI (mobile-responsive, resizable sidebar, collapsible)
- [x] Claude Code CLI subprocess as agent backend
- [x] Docker socket access (build, run, stop, logs)
- [x] Caddy route management (via Admin API for deployed apps)
- [x] Anthropic API + Vertex AI provider support (configured via UI)
- [x] Basic secret management (encrypted at rest)
- [x] Git routes (clone, init, pull, status)
- [x] Session management (create, join, delete, persist on reload)
- [x] Configurable system prompt with security rules
- [x] Real-time tool activity feedback (expandable tool messages)
- [x] Thinking indicator with live status
- [x] Settings as top-level nav tab
- [x] Setup script (domain, Docker, Caddy auto-SSL)

### Phase 2: Features (v0.2) — DONE
- [x] Multi-repo / workspace support
- [x] Secret proxy (secrets injected as SRIJAN_SECRET_* env vars at agent spawn)
- [x] Agent Boundaries (destructive Bash command blocklist, configurable via UI)
- [x] Agent confirm mode (approve actions before execution)
- [x] Cost tracking (token usage per session, USD cost in sidebar)
- [x] App dashboard (workspace cards, container sublists, logs, start/stop)
- [x] Terminal access (xterm.js PTY in browser)

### Phase 3: Workspace-first UX (v0.3) — DONE
- [x] Workspace-first navigation — workspace must exist before chat
- [x] Workspace switcher dropdown + inline create in sidebar
- [x] Session list scoped to current workspace
- [x] Background session streaming — all sessions stream events even when not active
- [x] Per-session activity indicators (spinner for running, blue dot for unread)
- [x] Dashboard workspace cards with metadata (session count, containers, cost, last activity)
- [x] Container filtering — only workspace-registered containers shown
- [x] WorkspaceInfo metadata endpoint

### Phase 4: Advanced (v1.0) — Planned
- [ ] Session snapshots, pause/resume
- [ ] Multi-user support (RBAC)
- [ ] Local model support (Ollama)
- [ ] GitHub bot (@mention on PRs/issues)
- [ ] File browser in UI
- [ ] Code editor in UI (Monaco)
- [ ] TOTP 2FA
