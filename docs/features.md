# Srijan - Feature Requirements & Roadmap

> Version: 0.9.0
> Date: 2026-03-20

---

## Feature Priority Matrix

### Must Have (MVP - Phase 1)

| # | Feature | Description | Status |
|---|---------|-------------|--------|
| 1 | Web Chat UI | Mobile-responsive chat with resizable sidebar, tool feedback, thinking indicator | **Done** |
| 2 | Agent Backend | Claude Code CLI subprocess with stream-json output | **Done** |
| 3 | Docker Access | Agent can build images, run/stop containers via mounted socket | **Done** |
| 4 | Caddy Route Management | Auto-configure routes via Caddy Admin API, provide live URLs | **Done** |
| 5 | Secret Management | Encrypted storage (AES-256), write-once display, CRUD via UI | **Done** |
| 6 | LLM Config | Anthropic API + Vertex AI provider toggle, model selection via UI | **Done** |
| 7 | Git Support | Clone, init, pull, status operations via REST API | **Done** |
| 8 | Shell Script Deploy | `curl \| bash` to set up on any VM with domain + SSL | **Done** |
| 9 | Auth | Password-based login with JWT session tokens | **Done** |
| 10 | HTTPS | Automatic TLS via Caddy (built-in ACME) | **Done** (Caddy config ready) |
| 11 | System Prompt | Configurable agent instructions with security rules, editable from UI | **Done** |
| 12 | Session Persistence | Sessions persist across reloads, delete support, event restoration | **Done** |
| 13 | Real-time Feedback | Expandable tool activity pills, thinking indicator, live status | **Done** |

### Phase 2 Features — Done

| # | Feature | Description | Status |
|---|---------|-------------|--------|
| 11 | Multi-Repo / Workspaces | Multiple named workspaces; sessions scoped to a workspace | **Done** |
| 12 | Secret Proxy | Secrets injected as `SRIJAN_SECRET_*` env vars at agent spawn; never visible to agent | **Done** |
| 13 | Agent Boundaries | Blocklist of dangerous Bash commands enforced at platform level; configurable via UI | **Done** |
| 14 | Agent Confirm Mode | `--permission-mode default` flag; agent asks before executing actions | **Done** |
| 15 | Cost Tracking | Token usage inserted per session on each result; USD cost shown in session sidebar | **Done** |
| 16 | App Dashboard | Workspace cards with session count, container count, cost, last activity | **Done** |
| 17 | Terminal Access | xterm.js PTY terminal in browser via node-pty WebSocket | **Done** |

### Phase 3 Features — Done

| # | Feature | Description | Status |
|---|---------|-------------|--------|
| 18 | Workspace-first UX | Workspace must exist before chat; all sessions scoped to workspace | **Done** |
| 19 | Workspace switcher | Sidebar dropdown + `+` inline create; persisted to localStorage | **Done** |
| 20 | Background session streaming | Persistent per-session WS forwarders; all sessions stream even when not active | **Done** |
| 21 | Per-session activity indicators | Spinner (agent running) + blue dot (unread) per session in sidebar | **Done** |
| 22 | Settings as nav tab | Settings promoted to top-level 4-tab navigation (Chat/Dashboard/Terminal/Settings) | **Done** |
| 23 | Container filtering | `GET /api/containers` returns only workspace-registered containers | **Done** |
| 24 | WorkspaceInfo metadata | `GET /api/workspaces` returns session count, container count, cost, last activity | **Done** |

### Phase 4 Features — Done

| # | Feature | Description | Status |
|---|---------|-------------|--------|
| 25 | File Browser | Two-panel tree + viewer for workspace files; Files tab in top nav | **Done** |
| 26 | Session Recording | Read-only event replay for any past session; replay button in Chat sidebar | **Done** |
| 27 | TOTP 2FA | Enable/disable via Settings → Security; QR code + manual key; challenge step at login | **Done** |
| 28 | Multi-User RBAC | admin/user roles; `/api/users` CRUD; Users section in Settings (admin only); username in header | **Done** |
| 29 | Settings Sidebar Nav | Two-column layout: fixed left nav selects section; sections: AI Provider, Agent, Security, Secrets, Users | **Done** |

### Phase 5 Features — Done

| # | Feature | Description | Status |
|---|---------|-------------|--------|
| 30 | Monaco Editor | In-browser code editor (two-panel tree + editor) with save via `PUT /api/workspaces/:name/file` | **Done** |
| 31 | LiteLLM Proxy | LiteLLM as a third LLM provider option alongside Anthropic and Vertex AI | **Done** |
| 32 | True Secret Proxy | HTTP+CONNECT proxy per agent spawn; placeholders substituted at network boundary | **Done** |
| 33 | Multi-SDK | `IAgentRunner` interface; factory dispatches to `AgentRunner` (Claude Code) or `OpenCodeRunner` stub; SDK toggle in Settings | **Done** |

### Phase 6 Features — Done

| # | Feature | Description | Status |
|---|---------|-------------|--------|
| 34 | Dashboard as Primary Page | App opens to Dashboard; nav tab order: Dashboard, Chat, Files, Terminal, Settings | **Done** |
| 35 | Workspace Creation in Dashboard | New Workspace panel with two tabs: New Repo (name + optional remote) and Clone Repo (URL → auto-name) | **Done** |
| 36 | Git Remote Linking from Dashboard | Each workspace card shows branch, remote URL; "Link Git Remote" button to set remote + push | **Done** |
| 37 | Git Push from Dashboard | Push button on each workspace card; spinner + "Pushed" confirmation; auto-loads stored credentials | **Done** |
| 38 | Removed WorkspaceEmptyState | Creation gate removed; workspace creation lives in Dashboard | **Done** |

### Phase 7 Features — Done

| # | Feature | Description | Status |
|---|---------|-------------|--------|
| 39 | GitHub PAT Authentication | Per-workspace PAT stored AES-256 encrypted; injected transiently into git URLs for clone/push/pull | **Done** |
| 40 | Azure DevOps PAT Authentication | Provider detection (`dev.azure.com`, `visualstudio.com`); PAT injected with Azure-compatible URL format | **Done** |
| 41 | Git Credential CRUD API | `GET/POST/DELETE /api/git/:name/credentials`; token never returned by GET (only provider + username) | **Done** |
| 42 | Auth in Workspace Creation | Provider dropdown + username + PAT fields on both New Repo and Clone Repo tabs | **Done** |
| 43 | Auth in Link Git Remote Panel | Credential fields shown atomically with remote URL when linking existing workspace | **Done** |
| 44 | Auth Edit/Remove Panel | Workspace cards with existing remote show "Auth" badge; clicking opens edit/delete credentials panel | **Done** |

### Phase 8 Features — Done

| # | Feature | Description | Status |
|---|---------|-------------|--------|
| 45 | Delete Workspace | Trash icon on each workspace card; confirmation modal warns about session count and running containers; cleans up credentials, sessions, apps, and filesystem | **Done** |
| 46 | Disable Chat/Files without workspaces | Chat and Files tabs disabled (greyed out) when no workspaces exist; auto-redirect to Dashboard if last workspace is deleted while on those views | **Done** |

### Phase 9 — Comprehensive Test Coverage — Done

| # | Feature | Description | Status |
|---|---------|-------------|--------|
| 47 | gitAuth unit tests | detectProvider, buildAuthUrl, stripAuthFromUrl, credential CRUD with encryption verification | **Done** |
| 48 | Git credential route tests | GET/POST/DELETE `/api/git/:name/credentials`; push and remote routes | **Done** |
| 49 | Workspaces API tests | GET list with metadata; POST init, clone, with/without auth credentials; credential save ordering | **Done** |
| 50 | Session function tests | deleteSession cascade (events removed), getSessionsByWorkspace, workspaceName persistence | **Done** |
| 51 | DB schema tests | git_credentials + token_usage tables; column checks for role/totp/workspace_name | **Done** |
| 52 | Runner config tests | getAgentMode (auto/confirm/fallbacks), getSystemPrompt, getAgentSdk, getApiKey, DEFAULT_SYSTEM_PROMPT | **Done** |
| 53 | useChat hook tests | 39 tests covering initial state, connect, all WS message types, sendMessage, workspace persistence | **Done** |
| 54 | Dashboard git auth UI tests | Auth badge (configured/unconfigured), Push button, Save Credentials, CreateWorkspacePanel auth toggle | **Done** |
| 55 | Chat tool pill tests | Expandable pills, toolInput/toolResult display, thinking indicator, cost badge, replay button | **Done** |
| 56 | Settings agent mode tests | Auto/Confirm toggle, Save Agent Settings endpoint, system prompt textarea, blocklist textarea | **Done** |
| 57 | FileBrowser dirty-cancel tests | Cancel with dirty changes shows confirm dialog; proceed clears edit; decline stays in edit mode | **Done** |

**Test totals: 216 backend (20 files) + 186 frontend (10 files) = 402 tests**

### Phase 10+ (Planned)

| # | Feature | Description | Source Inspiration |
|---|---------|-------------|-------------------|
| 47 | Local Models | Ollama integration for private inference | Netclode |
| 48 | GitHub Bot | @mention on PRs/issues triggers agent | Netclode |
| 49 | Webhook Notifications | Slack/Discord alerts for agent actions | Custom |
| 50 | OCI Packaging | Package agent configs as container images | Docker cagent |

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
