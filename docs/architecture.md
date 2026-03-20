# Srijan - Architecture Design

> Version: 0.9.0
> Date: 2026-03-20
> Status: Current

---

## Vision

Srijan is a self-hosted cloud AI development environment that runs on a single VM, accessible from any device (laptop or mobile) via a web browser. An AI coding agent can build applications, deploy them as Docker containers, configure routing, and provide live URLs -- all through a chat interface.

## Core Principles

1. **Simple deployment** -- single shell script to set up on any VM
2. **Mobile-first UI** -- responsive web chat that works on phones
3. **Agent autonomy** -- agent can build, deploy, and route apps independently
4. **Security by default** -- secrets never exposed to agent sandbox; authenticated encryption; CORS origin allowlist; rate-limited login
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
+-- API Server (Node.js + Express + TypeScript)
|   +-- /api/auth          # Login (password + TOTP challenge), JWT session tokens
|   +-- /api/chat          # Agent chat (WebSocket; persistent per-session forwarders)
|   +-- /api/config        # LLM/agent/system-prompt settings (GET/PUT)
|   +-- /api/secrets       # Secret management (CRUD, encrypted at rest)
|   +-- /api/apps          # Deployed app registration + Caddy route management
|   +-- /api/git/:name/*   # status, clone, init, remote, push, pull, credentials CRUD
|   +-- /api/workspaces    # List + create + delete workspaces (clone, init, optional remote + creds)
|   +-- /api/workspaces/:name/files  # File tree + read/write (Monaco editor backend)
|   +-- /api/containers    # List/start/stop/logs Docker containers
|   +-- /api/sessions/:id  # Cost aggregates, recording (event replay)
|   +-- /api/users         # CRUD (admin only; RBAC)
|   +-- /api/terminal      # WS PTY via node-pty (xterm.js backend)
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
+-- State Store (SQLite + WAL mode)
    +-- users             (id, username, password_hash, role, totp_secret, totp_enabled)
    +-- sessions          (id, user_id, workspace_name, created_at, updated_at)  [idx: user_id, workspace_name]
    +-- events            (id, session_id, type, data JSON, created_at)  [idx: session_id]
    +-- secrets           (id, name, encrypted_value, created_at)
    +-- apps              (id, name, workspace_name, port, path, container_id)
    +-- config            (key, value)
    +-- token_usage       (id, session_id, input_tokens, output_tokens, cost_usd, created_at)  [idx: session_id]
    +-- git_credentials   (id, workspace_name UNIQUE, provider, username, encrypted_token, created_at, updated_at)
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
|  SQLite (AES-256-GCM encrypted, auth tag) |
|  Only Secret Proxy process can decrypt       |
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
                              +-- Username + password auth (bcrypt hash)
                              +-- Login rate limiting (10 attempts / 15 min per username)
                              +-- JWT session token (24h expiry)
                              +-- Optional: TOTP 2FA (enable/disable via Settings)
                              +-- CORS origin allowlist (SRIJAN_ORIGIN env var)
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
|  Srijan  [Dashboard][Chat][Files][Terminal][Settings]     |
|           ● Connected  admin  [Logout]                    |
+----------------------------------------------------------+
|  DASHBOARD (primary / default view)                       |
|  +------------------------------------------------------+ |
|  | [+ New Workspace]                                    | |
|  |                                                      | |
|  |  my-react-app        branch: main  [Link Remote]     | |
|  |  3 sessions  2 containers  $0.024                    | |
|  |  Last active: 2 hours ago                            | |
|  |  [View Sessions]  [Show Containers v]                | |
|  |    todo-web  [running]  [Logs] [Stop]                | |
|  |    postgres  [running]  [Logs] [Stop]                | |
|  |                                                      | |
|  |  api-service    branch: main  github.com/…  [Push]   | |
|  |  1 session   0 containers  $0.012                    | |
|  |  Last active: yesterday                              | |
|  |  [View Sessions]  [Auth]                             | |
|  +------------------------------------------------------+ |
+----------------------------------------------------------+

CHAT view (after switching tab or creating workspace):
+----------------------------------------------------------+
| [◀] SIDEBAR  |  MAIN AREA                                |
|  Workspace   |                                            |
|  [my-app  v] |  > Build me a todo app                    |
|              |                                            |
|  [+ New Chat]|  ✓ Reading package.json                   |
|  ──────────  |  ● Running: npm install  (spinner)        |
|  Session 1 ⟳ |  ● ● ● Thinking...                       |
|  Session 2 🔵 |  Agent: Here's what I built...            |
|              |  +----------------------------------+      |
|  [Go to      |  | Type a message...           [▶]  |      |
|   Dashboard] |  +----------------------------------+      |
+----------------------------------------------------------+
```

- Header: 5-tab nav (Dashboard, Chat, Files, Terminal, Settings) — Dashboard is default/primary; Chat and Files tabs are disabled (greyed out) when no workspaces exist
- Dashboard: workspace cards with git info (branch, remote), push button, link/auth panels, trash-icon delete button; confirmation modal warns about sessions and running containers before cascading delete; "New Workspace" button at top with two-tab creation panel (New Repo / Clone Repo)
- Chat sidebar: resizable (180–480px), collapsible; "Go to Dashboard" link replaces inline create form
- Workspace switcher: dropdown (select workspace); creation moved to Dashboard
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

### Dashboard (Primary Page + Workspace Cards)

```
+------------------------------------------+
|  Dashboard                    [Refresh]   |
+------------------------------------------+
|  [+ New Workspace]                        |
|    (expands to: [New Repo] [Clone Repo])  |
|    New Repo tab: name, optional remote,   |
|      optional git credentials             |
|    Clone Repo tab: URL (name auto-fills), |
|      optional git credentials             |
+------------------------------------------+
|  my-react-app                    $0.0240 [🗑] |
|  branch: main   [Link Git Remote]         |
|  3 sessions  2 containers                 |
|  Last active: 2 hours ago                 |
|  [View Sessions]  [Show Containers v]     |
|    todo-web  [running]  [Logs] [Stop]     |
|    postgres  [running]  [Logs] [Stop]     |
+------------------------------------------+
|  api-service                         [🗑] |
|  branch: main   github.com/user/api  [Push] [Auth] |
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
|   +-- handoff.md               # Current state + run instructions for new developers
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
|   |   |   +-- git.ts           # status, clone, init, remote, push, pull, credential CRUD
|   |   |   +-- cost.ts          # GET /api/sessions/:id/cost
|   |   |   +-- containers.ts    # Filtered to registered app containers
|   |   |   +-- workspaces.ts    # WorkspaceInfo[] with metadata; POST create/clone; DELETE cascading cleanup
|   |   |   +-- terminal.ts      # WS PTY (node-pty)
|   |   |   +-- files.ts         # GET tree, GET/PUT file content for workspace file browser
|   |   |   +-- sessions.ts      # GET /api/sessions/:id/recording
|   |   |   +-- users.ts         # CRUD /api/users (admin only)
|   |   +-- agent/
|   |   |   +-- runner.ts        # Claude Code CLI subprocess, Vertex AI, boundaries, cost
|   |   |   +-- IAgentRunner.ts  # Interface for pluggable agent SDKs
|   |   |   +-- OpenCodeRunner.ts # OpenCode SDK stub (emits error event)
|   |   |   +-- events.ts        # Event type definitions
|   |   |   +-- session.ts       # Session CRUD, event persistence, delete with cascade, getSessionsByWorkspace
|   |   +-- security/
|   |   |   +-- auth.ts          # JWT + bcrypt auth + requireAdmin middleware
|   |   +-- docker/
|   |   |   +-- manager.ts       # Container lifecycle (dockerode + docker-compose)
|   |   |   +-- caddy.ts         # Caddy Admin API client
|   |   +-- git/
|   |   |   +-- manager.ts       # Git ops (simple-git); cloneRepo, setRemote, commitAll, pushRepo, pullRepo, deleteWorkspace — all auth-aware
|   |   +-- lib/
|   |   |   +-- crypto.ts        # AES-256-GCM encrypt/decrypt (v2); backward-compat CBC (v1)
|   |   |   +-- gitAuth.ts       # detectProvider, buildAuthUrl, stripAuthFromUrl, credential DB CRUD
|   |   |   +-- secretProxy.ts   # HTTP+CONNECT proxy; substitutes secret placeholders per agent spawn
|   |   +-- db/
|   |   |   +-- store.ts         # SQLite singleton (WAL mode, migrations)
|   |   |   +-- schema.sql       # Tables: users, sessions, events, secrets, apps, config, token_usage, git_credentials
|   |   +-- __tests__/           # 142 backend tests (vitest, forks pool)
|   +-- web/                      # React frontend (separate package.json)
|       +-- index.html
|       +-- vite.config.ts
|       +-- src/
|           +-- App.tsx           # 5-tab nav (Dashboard first), view routing, theme toggle
|           +-- components/
|           |   +-- Chat.tsx              # Workspace switcher, session activity indicators, "Go to Dashboard" link
|           |   +-- Dashboard.tsx         # Primary page; workspace cards with git info, push, auth, create panel
|           |   +-- Terminal.tsx          # xterm.js PTY (lazy-loaded)
|           |   +-- Settings.tsx          # Two-column nav: AI Provider, Agent, Security, Secrets, Users (admin)
|           |   +-- Login.tsx             # Password login + TOTP challenge step
|           |   +-- FileBrowser.tsx       # Two-panel tree + Monaco editor; lazy-loaded
|           |   +-- SessionRecording.tsx  # Read-only event replay for past sessions
|           +-- hooks/
|           |   +-- useChat.ts    # Per-session activity state, workspace state, WS hook, sessionCosts
|           +-- lib/
|           |   +-- api.ts        # HTTP client with JWT, WebSocket factory, getCurrentUser()
|           |   +-- utils.ts      # cn() — Tailwind class merge
|           +-- __tests__/        # 124 frontend tests (vitest)
+-- deployment/
|   +-- setup.sh                 # One-line setup script
|   +-- docker-compose.yml       # Caddy + Platform compose
|   +-- docker-compose.dev.yml   # Dev overrides (hot reload, volume mounts)
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

### Phase 4: Advanced Features (v0.4) — DONE
- [x] File browser (two-panel tree + Monaco editor in browser)
- [x] Session recording (read-only replay of past session events)
- [x] TOTP 2FA (enable/disable via Settings; QR code; challenge step at login)
- [x] Multi-user RBAC (admin/user roles, Users section in Settings, username in header)
- [x] Settings two-column sidebar nav (AI Provider, Agent, Security, Secrets, Users)

### Phase 5: Platform Integrations (v0.5) — DONE
- [x] Monaco Editor (in-browser code editor via `@monaco-editor/react`)
- [x] LiteLLM proxy as third LLM provider option
- [x] True Secret Proxy (HTTP+CONNECT proxy per spawn; substitutes placeholders at network boundary)
- [x] Multi-SDK agent factory (`IAgentRunner` interface; Claude Code + OpenCode stub)

### Phase 6: Dashboard-first UX (v0.6) — DONE
- [x] Dashboard as primary page (app opens to Dashboard, not Chat)
- [x] Workspace creation moved to Dashboard (New Repo + Clone Repo tabs with loading/error states)
- [x] Git remote linking from Dashboard (link panel per workspace card)
- [x] Git push from Dashboard (push button on card; spinner; "Pushed" confirmation)
- [x] WorkspaceEmptyState removed (creation gate replaced by Dashboard create panel)

### Phase 7: Git Authentication (v0.7) — DONE
- [x] GitHub PAT storage per workspace (AES-256 encrypted in `git_credentials` table)
- [x] Azure DevOps PAT support (provider detection; URL format compatible with ADO)
- [x] Generic git provider (Basic Auth via URL injection)
- [x] Transient auth URL injection (clean URL stored in `.git/config`; auth URL built at op time, then restored)
- [x] Credential CRUD API (`GET/POST/DELETE /api/git/:name/credentials`; token never returned)
- [x] Auth fields in workspace creation panel (both New Repo and Clone Repo tabs)
- [x] Auth fields in Link Git Remote panel (atomically sets remote + credentials)
- [x] Auth edit/remove panel on workspace cards with existing remotes

### Phase 9: Security Hardening (v0.9) — DONE
- [x] AES-256-GCM authenticated encryption (upgrade from CBC; backward-compatible v1 format still decrypts)
- [x] JWT secret startup check (logs critical warning if default secret is in use)
- [x] Login rate limiting (10 attempts / 15 min per username, in-memory)
- [x] TOTP input validated as exactly 6 digits before OTPAuth call
- [x] CORS origin allowlist (`SRIJAN_ORIGIN` env var; empty = allow same-origin only)
- [x] Caddy security headers: CSP, X-Frame-Options, HSTS, X-Content-Type-Options, Referrer-Policy; HTTP→HTTPS redirect
- [x] Docker Compose: resource limits (`mem_limit`/`cpus`), structured logging, required secrets use `:?` syntax
- [x] `requireAdmin` on all config `PUT` routes + config key allowlist
- [x] `requireAdmin` on secrets POST/DELETE
- [x] Secret name validation (alphanumeric + underscore, max 64 chars)
- [x] App name validation + port range check (1–65535); Caddy-first insert ordering (rollback on failure)
- [x] Username format validation + minimum 8-char password on create/change
- [x] Agent blocklist: case-insensitive normalization (catches `RM -RF /`)
- [x] Runner cleaned from map on subprocess error
- [x] Secret proxy: case-insensitive Content-Length; 10 MB body limit; sanitized error logging
- [x] `getSessionEvents()`: try/catch around JSON.parse — skips corrupt events with warning
- [x] Workspace name validation (`/^[a-zA-Z0-9_-]+$/`) in git manager, git routes, workspace routes, gitAuth
- [x] Credentials saved only after successful clone (not before); credential decrypt wrapped in try/catch
- [x] Git error messages sanitized (strip embedded `user:pass@` credentials)
- [x] Auth URL restoration guaranteed by `finally` blocks in push/pull
- [x] Symlink rejection in file browser (`lstatSync().isSymbolicLink()`); path length limit (4096)
- [x] File write: auto-creates parent dirs; rejects symlinks at target path
- [x] Terminal PTY spawns with sanitized env (strips `SRIJAN_*`, `ANTHROPIC_*`, `GOOGLE_*`, proxy vars)
- [x] Terminal resize: cols/rows clamped to 1–500
- [x] WebSocket: validates `type` field on incoming messages; ownership check on `join_session`; workspace name validated
- [x] WS reconnect: exponential backoff (3s → 6s → 12s → max 60s)
- [x] Message IDs use `crypto.randomUUID()` instead of `Date.now()`
- [x] Login: dynamic username field (replaces hardcoded `'admin'`); HTTP 429 feedback
- [x] DB indexes: `sessions(user_id)`, `sessions(workspace_name)`, `events(session_id)`, `token_usage(session_id)`
- [x] Migration logging: unexpected errors logged (not silently swallowed)
- [x] Caddy client: app name validated; Caddy-down vs. conflict errors distinguished; full body logged on non-2xx
- [x] Global Express JSON error handler (all unhandled errors return `{ error: { code, message } }`)
- [x] React `ErrorBoundary` wraps authenticated app content

### Phase 10+ (Planned)
- [ ] Local model support (Ollama)
- [ ] GitHub bot (@mention on PRs/issues triggers agent)
- [ ] Webhook notifications (Slack/Discord)
- [ ] OCI packaging (agent configs as container images)
- [ ] Session snapshots + pause/resume
