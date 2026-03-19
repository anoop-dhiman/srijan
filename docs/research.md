# Srijan - Research: Existing Solutions Analysis

> Research conducted: 2026-03-19
> Purpose: Analyze existing open-source cloud AI dev environments to refine features for Srijan

---

## 1. OpenHands (formerly OpenDevin)

**Repository:** https://github.com/OpenHands/OpenHands
**License:** MIT (core), Polyform Free Trial (enterprise Helm charts)
**Stars:** 68.6k+ | **Funding:** $18.8M Series A

### Architecture
- **Event stream pattern**: All agent-environment interactions flow as typed events: User Message -> Agent -> LLM -> Action -> Runtime (sandbox) -> Observation -> Agent
- **Docker sandbox**: Each session spins up an isolated container with REST API server inside
- **Security hardening**: `cap-drop ALL`, `no-new-privileges`, non-root execution (`SANDBOX_USER_ID=1000`), seccomp profiles blocking dangerous syscalls (mount, ptrace, reboot)
- **Container lifecycle**: `DockerWorkspace` uses context manager pattern - auto cleanup on scope exit. Healthcheck pings `/health` every 45s; 5 failures triggers restart
- **V1 SDK (2026)**: Moving from mandatory Docker to optional sandboxing, `LocalWorkspace` by default. V0 deprecated April 2026

### Web UI
- React SPA with REST API backend, accessible at `localhost:3000`
- Integrated workspace: chat panel, code editor (VS Code), file browser, terminal, web browser, Jupyter notebook, task planner
- Settings modal for LLM config, secrets management
- Cost display for token/API usage per conversation
- Also offers a CLI (Python 3.12+, no Docker needed)

### LLM Support
- Uses **LiteLLM** for 100+ provider abstraction
- Supports: Anthropic (direct, Bedrock, Vertex, Azure), OpenAI, Gemini, Ollama (local)
- Config via: env vars (`LLM_MODEL`, `LLM_API_KEY`), JSON files, code (Pydantic), UI settings
- Custom cost config per token, OpenAI Responses API support
- Best results with Claude models; local models (DeepSeek R1 via Ollama) practically unusable

### Secrets Management
- UI-based secrets manager (Settings > Secrets)
- Secrets become env vars in agent runtime (e.g., `AWS_ACCESS_KEY`)
- Write-once: cannot view/edit values after creation
- LLM API keys stored as `SecretStr`, redacted in serialized JSON

### Deployment
| Model | Infrastructure | Cost |
|-------|---------------|------|
| Open Source (local) | Your laptop, Docker, own LLM key | Free (MIT) |
| Cloud Individual | Hosted by OpenHands | Free tier, BYOK or at-cost LLM |
| Cloud Growth | Hosted by OpenHands | $500/month, unlimited users, RBAC |
| Self-hosted Enterprise | Your K8s cluster (VPC) | Custom pricing |

### Limitations
1. **High API costs** - complex tasks consume millions of tokens; single PR can cost $3+
2. **Requires frontier models** - unusable with local/small models
3. **Looping/planning drift** - on ambiguous tasks without clear specs
4. **Token waste** - searches for files it was already given paths to
5. **Setup difficulties** - Docker config issues common on macOS
6. **Multi-user instability** - originally single-user; multi-user historically caused crashes
7. **No app deployment/routing** - no nginx/domain management
8. **No mobile-optimized UI** - desktop-first React SPA
9. **Anthropic blocking (Jan 2026)** - API changes broke third-party access temporarily

### Patterns to Adopt
- Event stream architecture for agent-UI communication
- LiteLLM for multi-provider LLM support
- UI-based secrets manager (write-once, never displayed)
- Docker sandbox with security hardening (`cap-drop ALL`, seccomp, non-root)

---

## 2. Netclode

**Repository:** https://github.com/angristan/netclode
**License:** Open source
**Blog:** https://stanislas.blog/2026/02/netclode-self-hosted-cloud-coding-agent/
**Published:** February 2026

### Architecture
- **Stack**: k3s (single-node K8s) + Kata Containers + Cloud Hypervisor microVMs + JuiceFS + Tailscale + Redis
- **Control plane** (Go): orchestrates sessions, manages sandbox lifecycle
- **Agent** (Node.js): SDK runner, runs inside the Kata VM sandbox
- **Secret proxy** (Go): injects real API keys for allowed hosts
- **Auth proxy** (Go): adds SA tokens to requests
- **GitHub bot** (Go): webhook-driven for @mentions and dependency reviews

**Session flow:**
1. Control plane grabs pre-booted Kata VM from **warm pool** (instant start)
2. Agent connects TO control plane via single bidirectional Connect stream
3. Prompts forwarded to agent SDK inside VM, responses stream back
4. Redis Streams persist all events (cursor-based reconnection)

### SDK Support
| SDK | Package | Notes |
|-----|---------|-------|
| Claude Agent SDK | `@anthropic-ai/claude-agent-sdk` | Extended thinking (minimal -> xhigh), native tools, session persistence |
| OpenCode | CLI server mode | Multi-provider: Anthropic, OpenAI, Mistral, Ollama |
| GitHub Copilot | `@github/copilot-sdk` | Two backend options, uses your subscription |
| OpenAI Codex | `@openai/codex-sdk` | Direct OpenAI integration |
| Local (Ollama) | GPU inference | Requires NVIDIA GPU |

### Session Management (Best-in-class)
- **Pause/resume**: VM deleted, JuiceFS preserves workspace + tools + Docker images + SDK session in S3. Resume mounts same PVC to new VM
- **Turn-based snapshots**: Auto-snapshot after each agent turn. Rollback entire state (not just git) to any prior point
- **Session mapping**: `.session-mapping.json` maps control plane sessions to SDK sessions for seamless resume
- **Cost**: Paused sessions cost only S3 storage (practically nothing)

### Security (Best-in-class)
- **Secret proxy pattern**: API keys NEVER enter the sandbox. Agent sees `NETCLODE_PLACEHOLDER_xxx` values. Separate secret-proxy pod injects real credentials for allowed hosts only
- **MicroVM isolation**: Full root + Docker + sudo inside VM. Kata Container boundary is the security perimeter
- **GitHub App**: Per-repo scoped tokens generated on demand
- **Network**: Control plane only accessible via Tailnet (Tailscale). Not exposed to public internet

### Mobile Client
- **Native iOS/macOS SwiftUI app** (not on App Store - build yourself)
- Features: session list, model/SDK picker, live streaming, live terminal (node-pty with passwordless sudo), snapshot rollback, GitHub repo selection
- Multiple clients can share same terminal session
- **No web UI, no Android**

### Deployment
- Linux machine with **nested virtualization**, 2 vCPU, 8GB RAM minimum
- S3-compatible storage (DO Spaces, Cloudflare R2, MinIO)
- Tailscale OAuth credentials
- Single Ansible playbook: `ansible-playbook playbooks/site.yaml`
- Optional GPU: `NVIDIA_ENABLED=true OLLAMA_ENABLED=true`

### Limitations
1. **iOS only** - no web interface, no Android
2. **Heavy infra** - requires k3s, Kata, nested virtualization, S3
3. **No app deployment/routing** - uses Tailscale for port forwarding (private network only)
4. **No public URL generation** - apps only accessible via Tailnet
5. **Single user only** - designed for personal use
6. **NVIDIA-only GPU** - no AMD/Apple Silicon for local models
7. **Storage costs scale** - snapshots with Docker images accumulate S3 costs

### Patterns to Adopt
- Secret proxy (placeholder injection) - keys never in sandbox
- Session pause/resume with persistent storage
- Turn-based snapshots (full state rollback)
- Multi-SDK support (pluggable agent backends)
- Warm pool for instant session start
- Redis Streams for event persistence and reconnection

---

## 3. Coder

**Repository:** https://github.com/coder/coder
**License:** AGPL v3 (Community), Premium per-user license (Enterprise)
**Website:** https://coder.com

### Architecture
- Self-hosted cloud dev environment platform
- **coderd** control plane: dashboard UI + API + built-in Terraform provisioners (3 per replica)
- **Workspaces**: isolated dev environments defined by Terraform templates (EC2, K8s pods, Docker containers)
- **Workspace proxies**: relay connections for geo-distributed teams
- Supports Linux, Windows, macOS on x86 and ARM. SOC2 Type II certified

### AI Agent Integration
- **Coder Tasks** (Dec 2025): GitHub label triggers workspace -> Claude Code agent reads issue -> opens PR
- **Agent Boundaries**: process-level safeguards against destructive actions (open-source CLI)
- IDE agents: Cursor, Windsurf, GitHub Copilot, Roo Code all work via extensions
- Not a built-in agent - you bring your own

### Web IDE
- **code-server**: Coder's VS Code fork in the browser (MIT, separate project)
- Any web app can be a `coder_app` resource (Jupyter, RStudio, Airflow)
- SSH access: `ssh coder.<workspaceName>`
- Desktop IDE: VS Code, Cursor, Windsurf via Coder extension; JetBrains via Gateway
- Dev Container support with auto-detection

### Docker-in-Docker
- **Sysbox runtime**: unprivileged Docker/systemd inside containers
- **Envbox**: Coder-maintained image bundling Sysbox (outer container manages daemons, inner container is unprivileged workspace). No custom runtime needed on K8s nodes
- **CVMs (Container-based VMs)**: leverages Sysbox for Docker, Docker Compose, systemd

### Multi-User / RBAC
- Built-in roles: Member, Auditor, Template Admin, User Admin
- Premium: custom roles, multi-org, OIDC/SCIM group sync, resource quotas, audit logging
- SSO via OpenID Connect (Okta, KeyCloak, Azure AD)

### Limitations for Our Use Case
1. **No built-in AI agent** - infrastructure platform, not agent platform
2. **No chat interface** - IDE-based interaction only
3. **Complex setup** - Terraform templates, provisioners, PostgreSQL
4. **Overkill for single-user personal dev env**
5. **No app deployment/routing layer**
6. **AGPL v3 license** - copyleft restrictions if forking

### Patterns to Adopt
- Envbox pattern for Docker-in-Docker (clean, no custom runtime)
- Agent Boundaries for destructive action prevention
- Coder Tasks pattern (issue -> agent -> PR pipeline)

---

## 4. Daytona

**Repository:** https://github.com/daytonaio/daytona
**Website:** https://www.daytona.io
**Funding:** $24M Series A (Feb 2026)

### Architecture
- Pivoted Feb 2025 from dev environments to AI agent sandbox infrastructure
- **Sandboxes**: isolated Linux environments (Docker default, Kata Containers optional)
- **Interface plane**: SDKs (Python, TypeScript, Ruby, Go), CLI, Dashboard, MCP server
- **Control plane**: lifecycle management, scheduling, state reconciliation
- **Internal services**: Redis (caching), PostgreSQL (persistence), Auth0/OIDC
- **Proxy**: HTTP routing via `{port}-{sandboxId}.{proxy-domain}`
- Sub-90ms sandbox creation, auto-scaling zero to hundreds of nodes

### AI Agent Support
- Purpose-built for AI agents as primary consumer
- SDKs for programmatic sandbox CRUD, file system ops, Git ops, LSP integration
- Official LangChain integration, MCP Server support
- Multi-agent architectures (e.g., Project Manager + Developer agent with Claude Agent SDK)
- Docker-in-Docker fully supported (Docker Compose, even K8s inside sandbox)

### SDK / API
- SDKs: Python, TypeScript (works in browsers, Workers, Lambda), Ruby, Go
- RESTful API for full lifecycle
- Auth via API keys or JWT tokens

### Deployment
- **Cloud-hosted** (primary): usage-based, per-second billing. ~$0.067/hr small sandbox
- **Self-hosted**: Helm charts for K8s. Air-gapped supported
- Default sandbox: 1 vCPU, 1 GB RAM, 3 GiB disk

### Limitations for Our Use Case
1. **Not a dev environment** - sandbox infrastructure for code execution
2. **No UI/chat interface** - API/SDK only
3. **No built-in agent**
4. **Cloud-first pricing** - not designed for self-hosted single VM

### Patterns to Adopt
- Host-based routing for sandboxes (`{port}-{sandboxId}.{proxy-domain}`)
- Programmatic sandbox SDK pattern
- Sub-second sandbox creation design

---

## 5. Docker Sandbox / cagent (Docker Agent)

**Docs:** https://docs.docker.com/ai/sandboxes/
**Repository:** https://github.com/docker/docker-agent

### Docker Sandboxes
- Experimental feature in Docker Desktop 4.50+
- Runs coding agents (Claude Code, Gemini, Codex, Kiro) in isolated microVMs
- Private Docker daemon per microVM
- Local-first: mirrors workspace, enforces strict boundaries from host

### Docker Agent (cagent)
- Open-source multi-agent runtime, declarative YAML config
- Multi-agent orchestration: root coordinator delegates to specialized sub-agents
- Model-agnostic: OpenAI, Anthropic, Gemini, local models via Docker Model Runner
- MCP integration (Stdio, HTTP, SSE) for external tools
- **Agent distribution**: packaged as OCI artifacts (pull, pin, version, share like images)
- **Session recording**: VCR-pattern for deterministic replay with zero API costs
- **ACP (Agent Client Protocol)**: IDE integration
- **MCP Gateway**: centralized routing/auth for MCP servers

### Limitations for Our Use Case
1. **Local-only** - Docker Desktop feature, not cloud/VM
2. **No web UI** - terminal-based
3. **No remote access or deployment features**
4. **No multi-user**

### Patterns to Adopt (Maybe)
- Declarative YAML for agent orchestration (v3+)
- OCI artifact packaging for agent distribution
- Session recording/replay for debugging
- MCP Gateway pattern for tool management

---

## Comparative Matrix

| Feature | Our Requirement | OpenHands | Netclode | Coder | Daytona | Docker |
|---------|----------------|-----------|----------|-------|---------|--------|
| Web chat UI | Must | Yes | iOS only | No | No | No |
| Mobile access | Must | Partial | iOS only | No | No | No |
| Docker access for agent | Must | Sandboxed | Full (microVM) | Yes (Envbox) | Yes (DinD) | Yes |
| App deployment + routing | Must | No | No (Tailscale) | No | Host-routing | No |
| Multi-LLM config | Must | Yes (LiteLLM) | Yes (multi-SDK) | N/A | N/A | Yes |
| Secret protection | Must | Env vars | Proxy (best) | RBAC | API keys | Container |
| Shell script deploy | Must | Docker run | Ansible | Terraform | Helm | Docker Desktop |
| Git multi-repo | Must | GitHub | GitHub App | Yes | Git ops | No |
| Single VM deploy | Must | Yes | Needs nested virt | Yes | Cloud-first | Local |
| Session snapshots | Should | No | Yes (best) | No | Snapshots | No |
| Multi-user | Nice | Enterprise | No | Yes (best) | Basic | No |

---

## Conclusion

**No existing project fully matches our requirements.** Build custom, borrowing best patterns:

| Pattern | Source | Priority |
|---------|--------|----------|
| Secret proxy (placeholder injection) | Netclode | Must |
| Event stream for agent-UI | OpenHands | Must |
| LiteLLM for multi-provider | OpenHands | Must |
| Docker-in-Docker via Sysbox/Envbox | Coder | Must |
| Host-based routing for apps | Daytona | Must |
| Session snapshots (full state rollback) | Netclode | Should |
| Agent Boundaries (destructive action prevention) | Coder | Should |
| Multi-SDK support | Netclode | Should |
| Session recording/replay | Docker cagent | Nice |
| OCI artifact packaging | Docker cagent | Nice |
