# Srijan

**Cloud AI Development Environment** — Move your dev environment from local to cloud. Build, deploy, and manage applications through an AI coding agent, accessible from any device.

## What is Srijan?

Srijan is a self-hosted platform that runs on a single VM and provides:

- **Chat-based AI coding agent** accessible from laptop or mobile browser
- **Full Docker access** — agent can build images, run containers, deploy apps
- **Automatic routing** — deployed apps get live URLs under your domain
- **Secret protection** — API keys never exposed to the agent sandbox
- **Multi-LLM support** — Anthropic, Azure OpenAI, GCP Vertex, OpenAI

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

```bash
curl -sL https://get.srijan.dev | bash -s -- \
  --domain dev.example.com \
  --email you@example.com \
  --password <admin-password>
```

Then visit `https://dev.example.com/forge` from any device.

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
|  +-- API Server (Node.js)                     |
|  +-- Agent Runner (Claude Code / OpenCode)    |
|  +-- Secret Proxy                             |
|  +-- Docker Manager                           |
|  +-- Caddy Route Manager                      |
|                                               |
|  App Containers (agent-deployed)              |
|  +-- todo-app + postgres                      |
|  +-- api-service                              |
|  +-- ...                                      |
+----------------------------------------------+
```

## Documentation

- [Research: Existing Solutions](docs/research.md) — Analysis of OpenHands, Netclode, Coder, Daytona, Docker Sandbox
- [Architecture](docs/architecture.md) — System design, data flows, security model
- [Features & Roadmap](docs/features.md) — Requirements, user stories, phased roadmap

## Roadmap

| Phase | Focus | Status |
|-------|-------|--------|
| Phase 1 (MVP) | Chat UI, Claude Code agent, Docker deploy, Caddy routing, auth | Planned |
| Phase 2 | Multi-LLM (LiteLLM), multi-repo, secret proxy, agent boundaries | Planned |
| Phase 3 | Session snapshots, pause/resume, cost tracking | Planned |
| Phase 4 | Multi-user, local models, GitHub bot, file browser | Planned |

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React + Vite + xterm.js |
| Backend | Node.js + Express + WebSocket |
| Agent | Claude Code SDK / OpenCode |
| LLM Routing | LiteLLM |
| Database | SQLite |
| Containers | Docker Engine |
| Proxy | Caddy (auto HTTPS) |
| Security | Secret Proxy + Agent Boundaries |

## License

TBD
