# Srijan - Feature Requirements & Roadmap

> Version: 0.1.0
> Date: 2026-03-19

---

## Feature Priority Matrix

### Must Have (MVP - Phase 1)

| # | Feature | Description | Source Inspiration |
|---|---------|-------------|-------------------|
| 1 | Web Chat UI | Mobile-responsive chat interface for agent interaction | OpenHands |
| 2 | Agent Backend | Claude Code as primary coding agent | Netclode |
| 3 | Docker Access | Agent can build images, run/stop containers via mounted socket | All |
| 4 | Caddy Route Management | Auto-configure routes via Caddy Admin API, provide live URLs | Daytona routing |
| 5 | Secret Management | Encrypted storage, write-once display, env var injection | OpenHands |
| 6 | LLM Config | Anthropic API key + model selection via UI | OpenHands |
| 7 | Git Support | Clone, commit, push operations for a single repo | Netclode |
| 8 | Shell Script Deploy | `curl | bash` to set up on any VM with domain + SSL | Netclode Ansible |
| 9 | Auth | Password-based login with JWT session tokens | All |
| 10 | HTTPS | Automatic TLS via Caddy (built-in ACME) | Standard |

### Should Have (Phase 2-3)

| # | Feature | Description | Source Inspiration |
|---|---------|-------------|-------------------|
| 11 | Multi-LLM Providers | Azure OpenAI, GCP Vertex, OpenAI via LiteLLM | OpenHands LiteLLM |
| 12 | Multi-Repo | Support multiple git repositories simultaneously | Coder |
| 13 | Secret Proxy | Placeholder injection - API keys never enter agent sandbox | Netclode |
| 14 | Agent Boundaries | Block destructive commands (rm -rf /, docker rm platform) | Coder |
| 15 | App Dashboard | Running containers, logs, URLs, start/stop controls | Custom |
| 16 | Terminal Access | xterm.js terminal in browser connected to agent workspace | Netclode |
| 17 | Multiple Agent SDKs | OpenCode, Codex as alternative agent backends | Netclode |
| 18 | Session Snapshots | Turn-based state snapshots with full rollback capability | Netclode |
| 19 | Session Pause/Resume | Save and restore complete session state | Netclode |
| 20 | Agent Confirm Mode | Approve actions before execution (vs yolo mode) | Claude Code |
| 21 | Cost Tracking | Token usage per session/conversation | OpenHands |

### Nice to Have (Phase 4+)

| # | Feature | Description | Source Inspiration |
|---|---------|-------------|-------------------|
| 22 | Multi-User | RBAC, multiple user accounts | Coder |
| 23 | Local Models | Ollama integration for private inference | Netclode |
| 24 | GitHub Bot | @mention on PRs/issues triggers agent | Netclode |
| 25 | Session Recording | VCR-pattern replay for debugging/testing | Docker cagent |
| 26 | File Browser | Navigate workspace files in browser | OpenHands |
| 27 | Code Editor | Monaco editor in browser | OpenHands |
| 28 | TOTP 2FA | Two-factor authentication | Standard |
| 29 | Webhook Notifications | Slack/Discord alerts for agent actions | Custom |
| 30 | OCI Packaging | Package agent configs as container images | Docker cagent |

---

## User Stories

### MVP User Stories

**US-1: First-Time Setup**
> As a developer, I want to run a single command on my VM to set up Srijan with SSL, so that I can start using it within minutes.

Acceptance criteria:
- `curl -sL https://get.srijan.dev | bash -s -- --domain dev.example.com --email me@example.com --password mypass`
- Installs Docker if not present
- Starts Caddy + Platform containers via Docker Compose
- Caddy auto-provisions SSL certificate
- Prints access URL

**US-2: Login from Mobile**
> As a developer on my phone, I want to visit https://dev.example.com/forge and log in, so I can interact with the agent from anywhere.

Acceptance criteria:
- Login page with password field
- JWT token stored in browser
- Responsive layout works on mobile screens
- Session persists across page refreshes

**US-3: Chat with Agent**
> As a developer, I want to type instructions in a chat interface and see the agent's responses streaming in real-time, like a terminal but in a chat format.

Acceptance criteria:
- WebSocket connection for real-time streaming
- Agent responses show file changes, commands run, and output
- Markdown rendering for code blocks
- Auto-scroll to latest message

**US-4: Build and Deploy an App**
> As a developer, I want to tell the agent "Build a todo app with postgres" and have it create the code, build Docker images, deploy containers, and give me a working URL.

Acceptance criteria:
- Agent creates project files in /workspaces/
- Agent builds Docker image(s)
- Agent runs containers via docker compose
- Agent registers app route with platform
- Caddy auto-configured with new route via Admin API
- User receives working URL (https://domain.com/todo)

**US-5: Configure LLM Provider**
> As a developer, I want to configure my Anthropic API key and select a model through the settings UI.

Acceptance criteria:
- Settings page with LLM section
- API key field (masked after save)
- Model dropdown (claude-sonnet-4-6, claude-opus-4-6, etc.)
- Changes take effect immediately for next agent interaction

**US-6: Manage Secrets**
> As a developer, I want to add secrets (like AWS keys) that the agent can use without ever seeing the actual values.

Acceptance criteria:
- Add secret: name + value
- Value not displayed after creation
- Secrets available as env vars in agent runtime
- Secret proxy prevents agent from exfiltrating keys

---

## Non-Functional Requirements

### Performance
- Chat message latency: < 200ms (WebSocket roundtrip, excluding LLM response time)
- App deployment: agent should be able to deploy a simple app in < 5 minutes
- Caddy route update: instant (API-driven, no reload)
- Platform container startup: < 10 seconds

### Security
- All traffic over HTTPS (TLS 1.2+)
- Secrets encrypted at rest (AES-256)
- Agent cannot access secrets vault directly
- Docker commands filtered through allowlist
- Destructive commands blocked by Agent Boundaries
- JWT tokens expire after 24 hours
- Password stored as bcrypt hash (cost 12)

### Reliability
- Platform container auto-restarts on failure (Docker restart policy)
- Healthcheck endpoint for monitoring
- SQLite with WAL mode for concurrent reads
- Event stream persisted for session recovery

### Compatibility
- VM: Ubuntu 22.04+, Debian 12+, Amazon Linux 2023
- Browser: Chrome, Safari, Firefox (latest 2 versions)
- Mobile: iOS Safari, Android Chrome
- Docker: Engine 24+ (no Docker Desktop required)
- Minimum VM: 2 vCPU, 4GB RAM, 20GB disk

---

## Out of Scope (Explicit)

1. Native mobile apps (iOS/Android) -- web-only
2. Multi-node clustering / HA -- single VM only
3. Kubernetes support -- Docker only
4. GPU / local model hosting -- cloud LLM APIs only (until Phase 4)
5. Custom IDE / code editor -- chat + terminal only (until Phase 4)
6. CI/CD pipeline integration -- manual deploy via agent only
7. Billing / payment -- self-hosted, BYOK
