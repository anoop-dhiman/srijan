# Srijan - Architecture Design

> Version: 0.1.0
> Date: 2026-03-19
> Status: Draft

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
| 2 | Agent execution | Claude Agent SDK (programmatic) | Structured events, action interception, session control |
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
| Agent SDK | **@anthropic-ai/claude-code** | Programmatic control, structured events, action interception |
| LLM Calls | **Anthropic SDK (direct)** | Platform calls LLM on behalf of agent; LiteLLM in Phase 2 |
| State Store | **SQLite** (via better-sqlite3) | Zero-config, single-file DB |
| Terminal | **node-pty + xterm.js** | PTY for agent, xterm.js for browser (Phase 2) |
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
+------------------------------------------+
|  Srijan                    [Settings] |
+------------------------------------------+
|                                           |
|  +-------------------------------------+ |
|  | Agent Output / Chat                  | |
|  |                                      | |
|  | > Build me a todo app with           | |
|  |   postgres and multi-user auth       | |
|  |                                      | |
|  | [Agent] Setting up workspace...      | |
|  | [Agent] Creating backend...          | |
|  | [Agent] Building Docker image...     | |
|  | [Agent] Deploying...                 | |
|  | [Agent] App live at:                 | |
|  |   https://dev.example.com/todo       | |
|  +-------------------------------------+ |
|                                           |
|  +-------------------------------------+ |
|  | [Terminal] [Apps] [Repos]            | |
|  | (collapsible bottom panel)           | |
|  +-------------------------------------+ |
|                                           |
|  +---------------------+ [clip] [send]   |
|  | Type a message...   |                 |
|  +---------------------+                 |
+------------------------------------------+
```

### Settings Panel

```
+------------------------------------------+
|  Settings                         [Close] |
+------------------------------------------+
|                                           |
|  LLM Provider                             |
|  +-------------------------------------+ |
|  | Provider: [Anthropic v]              | |
|  | API Key: ************               | |
|  | Model:   [claude-sonnet-4.6 v]       | |
|  +-------------------------------------+ |
|                                           |
|  Agent                                    |
|  +-------------------------------------+ |
|  | Backend: [Claude Code v]             | |
|  | Mode:    [Auto / Confirm v]          | |
|  +-------------------------------------+ |
|                                           |
|  Git Repositories                         |
|  +-------------------------------------+ |
|  | [+ Add Repository]                  | |
|  | todo-app  github.com/user/todo      | |
|  | api-svc   github.com/user/api       | |
|  +-------------------------------------+ |
|                                           |
|  Secrets                                  |
|  +-------------------------------------+ |
|  | [+ Add Secret]                       | |
|  | AWS_ACCESS_KEY    ************       | |
|  | DATABASE_URL      ************       | |
|  +-------------------------------------+ |
|                                           |
|  Security                                 |
|  +-------------------------------------+ |
|  | Change Password                      | |
|  | Active Sessions: 2                   | |
|  +-------------------------------------+ |
+------------------------------------------+
```

### Apps Dashboard (Bottom Panel)

```
+------------------------------------------+
|  Deployed Apps                            |
+------------------------------------------+
|  todo-app  /todo  :3001  [Running]  [...] |
|  api-svc   /api   :3002  [Running]  [...] |
|  ml-model  /ml    :3003  [Stopped]  [...] |
|                                           |
|  [...] menu: Logs | Restart | Stop | Remove
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
|   |   +-- server.ts            # Express API server
|   |   +-- routes/
|   |   |   +-- auth.ts
|   |   |   +-- chat.ts          # WebSocket handler
|   |   |   +-- config.ts
|   |   |   +-- secrets.ts
|   |   |   +-- repos.ts
|   |   |   +-- apps.ts
|   |   |   +-- events.ts
|   |   +-- agent/
|   |   |   +-- runner.ts        # Agent execution manager
|   |   |   +-- sdk/
|   |   |   |   +-- claude.ts    # Claude Code SDK adapter
|   |   |   |   +-- opencode.ts  # OpenCode adapter
|   |   |   |   +-- codex.ts     # Codex adapter
|   |   |   +-- boundaries.ts    # Command filtering
|   |   |   +-- events.ts        # Event stream types
|   |   |   +-- session.ts       # Session management
|   |   +-- security/
|   |   |   +-- secret-proxy.ts  # Outbound HTTP key injection
|   |   |   +-- vault.ts         # Encrypted secret storage
|   |   |   +-- auth.ts          # JWT + password auth
|   |   +-- docker/
|   |   |   +-- manager.ts       # Container lifecycle
|   |   |   +-- caddy.ts         # Caddy Admin API client
|   |   +-- git/
|   |   |   +-- manager.ts       # Git operations
|   |   +-- db/
|   |       +-- store.ts         # SQLite wrapper
|   |       +-- schema.sql       # Database schema
|   +-- web/                      # React frontend
|       +-- index.html
|       +-- vite.config.ts
|       +-- src/
|           +-- App.tsx
|           +-- components/
|           |   +-- Chat.tsx
|           |   +-- Terminal.tsx
|           |   +-- Settings.tsx
|           |   +-- AppDashboard.tsx
|           |   +-- RepoManager.tsx
|           +-- hooks/
|               +-- useWebSocket.ts
|               +-- useAgent.ts
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

### Phase 1: MVP (v0.1)
- [ ] Setup script (domain, Docker, Caddy auto-SSL)
- [ ] Platform container with API server
- [ ] Password auth + JWT sessions
- [ ] Chat UI (mobile-responsive)
- [ ] Claude Code as agent backend (single SDK)
- [ ] Docker socket access (build, run, stop, logs)
- [ ] Caddy route management (via Admin API for deployed apps)
- [ ] Single LLM provider (Anthropic direct)
- [ ] Basic secret management (encrypted at rest)
- [ ] Single git repo support

### Phase 2: Multi-Provider (v0.2)
- [ ] LiteLLM integration (Azure, Vertex, OpenAI)
- [ ] Multi-repo support
- [ ] OpenCode as second agent backend
- [ ] Secret proxy (placeholder injection pattern)
- [ ] Agent Boundaries (destructive command blocking)
- [ ] App dashboard (running containers, logs, URLs)
- [ ] Terminal access (xterm.js)

### Phase 3: Sessions & Safety (v0.3)
- [ ] Session pause/resume
- [ ] Turn-based snapshots (full state rollback)
- [ ] Agent confirm mode (approve actions before execution)
- [ ] Codex SDK integration
- [ ] Cost tracking (token usage per session)
- [ ] Webhook notifications (Slack, Discord)

### Phase 4: Advanced (v1.0)
- [ ] Multi-user support (RBAC)
- [ ] Local model support (Ollama)
- [ ] GitHub bot (@mention on PRs/issues)
- [ ] Session recording/replay
- [ ] File browser in UI
- [ ] Code editor in UI (Monaco)
- [ ] TOTP 2FA
