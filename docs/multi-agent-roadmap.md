# Multi-Agent Integration Roadmap

Integration of features from `claude-code-by-agents` (Agentrooms) into Srijan.

## Overview

Four sequential phases, each independently shippable and building on the previous.

```
Phase A  ->  Phase B  ->  Phase C  ->  Phase D
OAuth        Plan UI      @Roles       Multi-Agent
(2 weeks)    (1.5 wks)    (1 week)     (3 weeks)
```

---

## Phase A — Claude OAuth Authentication

**Goal:** Users can authenticate using their Claude Pro/Team subscription instead of providing an API key. Eliminates the single biggest barrier to new users.

### How it works

Claude Code CLI accepts a `CLAUDE_CODE_OAUTH_TOKEN` env var in place of `ANTHROPIC_API_KEY`. Srijan stores the OAuth token encrypted per user in the DB and injects it at subprocess spawn time.

The OAuth flow for Srijan (web, not Electron):
1. User clicks "Connect Claude Account" in Settings
2. User opens the Terminal tab, runs `claude auth login`, completes the browser flow
3. User runs `cat ~/.claude/.credentials.json` and pastes the access token into Settings
4. Token is stored encrypted in `user_oauth_tokens` table keyed by `user_id`
5. At spawn time: inject `CLAUDE_CODE_OAUTH_TOKEN` instead of `ANTHROPIC_API_KEY`

### DB Changes

```sql
CREATE TABLE user_oauth_tokens (
  user_id                 TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  encrypted_access_token  TEXT NOT NULL,
  encrypted_refresh_token TEXT,
  expires_at              INTEGER,  -- unix ms
  account_email           TEXT,
  subscription_type       TEXT,
  updated_at              TEXT NOT NULL DEFAULT (datetime('now'))
);
```

### Backend Changes

| File | Change |
|---|---|
| `db/schema.sql` | Add `user_oauth_tokens` table; migration in `store.ts` |
| `agent/runner.ts` | New `getOAuthToken(userId)` fn; in `sendMessage()`, if OAuth token exists and not expired inject `CLAUDE_CODE_OAUTH_TOKEN`, delete `ANTHROPIC_API_KEY` |
| `routes/auth.ts` | `GET /api/auth/claude-oauth/status` — token metadata (email, expiry, sub type); `DELETE /api/auth/claude-oauth` — revoke |
| `routes/config.ts` | `POST /api/auth/claude-oauth/token` — accepts `{ accessToken, refreshToken, expiresAt, accountEmail, subscriptionType }`, encrypts and stores |

Reuses existing `lib/crypto.ts` AES-256-CBC encrypt/decrypt — no changes needed there.

### Runner change (simplified)

```ts
// Before (runner.ts ~line 227):
} else {
  env['ANTHROPIC_API_KEY'] = this.apiKey;
}

// After Phase A:
} else {
  const oauthToken = getOAuthToken(this.userId);
  if (oauthToken) {
    env['CLAUDE_CODE_OAUTH_TOKEN'] = oauthToken;
    delete env['ANTHROPIC_API_KEY'];
  } else {
    env['ANTHROPIC_API_KEY'] = this.apiKey;
  }
}
```

### Auth priority order (after Phase A)

```
LiteLLM -> Vertex -> Claude OAuth token -> Anthropic API key
```

### Frontend Changes

**Settings.tsx** — new "Claude Account" section under AI Provider:

```
AI Provider
  o Anthropic API Key    [existing]
  o Vertex AI            [existing]
  o LiteLLM              [existing]
  o Claude Account       [NEW]
     Status: connected  anoop@example.com  (Pro)  Expires in 23h
     [Disconnect]

     To connect:
     1. Open the Terminal tab
     2. Run: claude auth login
     3. Run: cat ~/.claude/.credentials.json
     4. Paste the accessToken below:
     [____________] [Connect]
```

Add `getClaudeOAuthStatus()`, `connectClaudeOAuth(token)`, `disconnectClaudeOAuth()` to `src/lib/api.ts`.

### Tests

- `user_oauth_tokens` store/retrieve/expiry check
- Token injection in runner (mock subprocess, assert env var)
- Settings UI: connect/disconnect OAuth state transitions

---

## Phase B — Orchestration Plan UI

**Goal:** When the agent proposes a multi-step plan, render it as an interactive card with step status indicators. Works with the existing single-agent architecture — no runner model changes.

### How it works

1. Add `propose_plan` MCP tool to `agent/mcpServer.ts`
2. Agent calls this tool before starting complex tasks — emits a `plan_proposed` event
3. Frontend renders it as a `PlanCard` in the message stream
4. Each step shows a status badge (pending / running / done / failed)
5. "Execute All" auto-sends follow-up messages sequentially; "Step by Step" lets user trigger each

### MCP Tool (`agent/mcpServer.ts`)

```ts
{
  name: 'propose_plan',
  description: 'Show the user a structured execution plan before starting work. Call this when a task has 3+ distinct steps.',
  inputSchema: {
    type: 'object',
    properties: {
      title: { type: 'string' },
      steps: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            id:           { type: 'string' },
            title:        { type: 'string' },
            description:  { type: 'string' },
            dependencies: { type: 'array', items: { type: 'string' } }
          },
          required: ['id', 'title']
        }
      }
    },
    required: ['title', 'steps']
  }
}
```

Handler POSTs to `POST /api/sessions/:id/plan` with the plan data.

### Backend Changes

| File | Change |
|---|---|
| `agent/mcpServer.ts` | Add `propose_plan` tool + handler that POSTs to `/api/sessions/:id/plan` |
| `routes/sessions.ts` | `POST /api/sessions/:id/plan` — validates and emits `plan_proposed` WS event to session |
| `agent/events.ts` | New event type `plan_proposed` with `{ title, steps[] }` data shape |

### Frontend Changes

**New `PlanCard.tsx` component:**

```
+------------------------------------------+
| Plan: Build user auth system             |
+------------------------------------------+
| o Step 1  Create DB schema               |
| - Step 2  Build API endpoints    [done]  |
| . Step 3  Add JWT middleware     [next]  |
| o Step 4  Wire up frontend               |
+------------------------------------------+
| [Execute All]  [Step by Step]  [Cancel]  |
+------------------------------------------+
```

**`useChat.ts`** — handle `plan_proposed` event, store plan in state, update step statuses as `tool_use` events arrive.

**`Chat.tsx`** — render `PlanCard` when event type is `plan_proposed`.

### System prompt addition

Append to `getSystemPromptAddition()` in `runner.ts`:

```
## Planning
For tasks with 3 or more distinct steps, call propose_plan BEFORE starting work.
List steps clearly with dependencies. Wait for the plan to be shown before executing.
```

### Tests

- `propose_plan` MCP tool emits correct event format
- `plan_proposed` event saved to DB and forwarded via WS
- `PlanCard` renders step list and status transitions correctly

---

## Phase C — @Mention Agent Roles (Single Runner)

**Goal:** Users type `@backend`, `@reviewer`, `@devops` etc. to switch the agent's focus — different system prompt, tool restrictions, and working subdirectory — without spinning up multiple processes. Lays the groundwork for Phase D.

### Default roles (pre-seeded)

| Role | Focus | Tools | Subdir |
|---|---|---|---|
| `@coder` | Full-stack implementation | All tools | root |
| `@reviewer` | Code review, no edits | Read, Glob, Grep only | root |
| `@devops` | Docker, infra, deploy | Bash, Read, Write | root |
| `@planner` | Architecture, no execution | Read, Glob | root |

Admins can create, edit, and delete roles in Settings.

### DB Changes

```sql
CREATE TABLE agent_roles (
  id                    TEXT PRIMARY KEY,
  name                  TEXT UNIQUE NOT NULL,   -- 'coder', 'reviewer'
  display_name          TEXT NOT NULL,
  description           TEXT NOT NULL DEFAULT '',
  system_prompt_addition TEXT NOT NULL DEFAULT '',
  allowed_tools         TEXT,                   -- JSON array or null (null = all tools)
  blocked_tools         TEXT NOT NULL DEFAULT '[]',
  subdir                TEXT NOT NULL DEFAULT '', -- relative to workspace root
  is_default            INTEGER NOT NULL DEFAULT 0,
  created_at            TEXT NOT NULL DEFAULT (datetime('now'))
);
```

### Backend Changes

| File | Change |
|---|---|
| `db/schema.sql` | Add `agent_roles` table; seed default roles in `store.ts` |
| `routes/roles.ts` (new) | `GET /POST /api/roles`, `PUT /DELETE /api/roles/:id` (admin only) |
| `routes/chat.ts` | Parse `@roleName` from incoming WS `message`; resolve role config; pass to `getOrCreateRunner()` |
| `agent/runner.ts` | `sendMessage()` accepts optional `roleConfig`; overrides `workspacePath` subdir, appends role system prompt, passes `--allowedTools` flag if restricted |
| `agent/events.ts` | New `role_switched` event type |

### WS Protocol change

```ts
// Client -> Server (new optional field):
{ type: 'message', content: '@reviewer check auth.ts' }
// Server auto-parses @mention and resolves roleId

// Server -> Client (new event):
{ type: 'agent_event', data: { type: 'role_switched', role: 'reviewer', displayName: 'Code Reviewer' } }
```

### Frontend Changes

- `RolePicker` dropdown below chat input showing available roles
- `@mention` autocomplete popover in `ChatInput.tsx` — typing `@` shows role list
- Role badge on agent response messages: `[Reviewer] "I found 3 issues in auth.ts..."`
- Settings — new "Agent Roles" section (admin only): table of roles with create/edit/delete form

### Tests

- `@mention` parsing in WS handler resolves correct role
- Role DB CRUD operations
- Runner receives role config, CLI invocation includes correct flags
- Role badge renders on message bubbles

---

## Phase D — Multi-Agent Per Workspace

**Goal:** Multiple concurrent Claude Code processes within one session, each specialized for a different part of the codebase. Messages routed by `@agentName`, each agent has its own conversation thread, subdirectory, and cost tracking.

### Architecture

```
Session
  +-- AgentRegistry (replaces single runner per session)
        +-- AgentRunner("frontend")  -> subprocess @ workspace/frontend/
        +-- AgentRunner("backend")   -> subprocess @ workspace/backend/
        +-- AgentRunner("devops")    -> subprocess @ workspace/
```

Each runner has its own `claudeSessionId` (independent `--resume` history), emits events tagged with `agentId`, and has its own rows in `token_usage`.

### DB Changes

```sql
CREATE TABLE session_agents (
  id               TEXT PRIMARY KEY,
  session_id       TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  name             TEXT NOT NULL,               -- 'frontend', 'backend'
  display_name     TEXT NOT NULL,
  role_id          TEXT REFERENCES agent_roles(id),
  subdir           TEXT NOT NULL DEFAULT '',
  claude_session_id TEXT,                       -- persisted for --resume
  status           TEXT NOT NULL DEFAULT 'idle', -- idle, running, stopped
  created_at       TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(session_id, name)
);

-- Migrations on existing tables:
ALTER TABLE token_usage ADD COLUMN agent_id TEXT;
ALTER TABLE events ADD COLUMN agent_id TEXT;
```

### Backend Changes

| File | Change |
|---|---|
| `agent/runner.ts` | Extract to `AgentRunner` class file; add `agentId` field; tag all emitted events with `agentId` |
| `agent/AgentRegistry.ts` (new) | `Map<agentId, AgentRunner>` per session; `getOrCreate(sessionId, agentId, config)`; aggregates all runners' events |
| `routes/chat.ts` | WS `message` handler parses `@agentName` -> resolves from `session_agents` -> routes to specific runner; if agent doesn't exist, creates it |
| `routes/sessions.ts` | `GET /api/sessions/:id/agents` — list session agents with status and cost |
| `db/store.ts` | `createSessionAgent()`, `getSessionAgents()`, `updateAgentClaudeSession()` |
| `agent/session.ts` | `getSessionEvents()` returns `agentId` in event data for session recording |
| `agent/events.ts` | All event creators accept optional `agentId` parameter |

### WS Protocol additions

```ts
// Server -> Client (events tagged with agentId):
{
  type: 'agent_event',
  data: {
    type: 'agent_response',
    agentId: 'frontend',   // NEW
    content: '...',
  }
}

// Client -> Server:
{ type: 'message', content: '@frontend add a login button' }

// New server -> client messages:
{ type: 'agent_created', data: { id, name, displayName, status } }
{ type: 'agent_status',  data: { agentId, status } }
{ type: 'agents_list',   data: [{ id, name, displayName, status, cost_usd }] }
```

### Frontend Changes

**`AgentSidebar` panel** (within the session view):

```
AGENTS
  [frontend]   $0.023   active
  [backend]    $0.041   idle
  [devops]     $0.008   idle
  [+ Add Agent]
```

**Message attribution** — every message bubble shows the originating agent:
```
[Frontend]  (typing...)
[Backend]   "I've created the API endpoint at /auth/login..."
```

**`@mention` autocomplete** shows agents (by name) instead of/alongside roles.

**`PlanCard` (Phase B) + multi-agent**: plan steps dispatched to named agents automatically — full end-to-end orchestration.

**Session cost badge** in sidebar sums `token_usage` across all agents in the session.

**`SessionRecording.tsx`**: replay shows agent attribution per message; add agent filter.

### Full orchestration flow (Phases B + D combined)

```
User: "Build a login system"

1. Orchestrator agent calls propose_plan:
   Step 1 -> @backend   "Create /auth/login endpoint with JWT"
   Step 2 -> @frontend  "Build LoginForm component"   [deps: step1]
   Step 3 -> @devops    "Add env vars to docker-compose.yml"  [deps: step1]

2. PlanCard renders in UI

3. User clicks "Execute All":
   - Step 1 dispatched to backend AgentRunner
   - Steps 2 and 3 queued until Step 1 completes (dependency check)
   - PlanCard updates step statuses in real time
```

### Tests

- `AgentRegistry` creates, retrieves, routes to correct runner by name
- WS `@mention` parsing routes to correct agent subprocess
- Events tagged with `agentId`, persisted with correct column value
- Session recording replay attributes messages to correct agents
- Cost summed correctly per-agent and rolled up to per-session total

---

## Summary Timeline

```
Week 1-2     Phase A  Claude OAuth
             - DB migration + token storage
             - Runner env var injection
             - Settings "Claude Account" section

Week 3-4     Phase B  Orchestration Plan UI
             - propose_plan MCP tool
             - plan_proposed event + WS relay
             - PlanCard frontend component

Week 5       Phase C  @Mention Agent Roles
             - agent_roles table + default roles seeded
             - WS @mention parsing -> role config lookup
             - Runner role overrides (subdir, tools, prompt)
             - RolePicker + autocomplete in ChatInput

Week 6-8     Phase D  Multi-Agent Per Workspace
             - AgentRegistry replacing single runner
             - session_agents table + migrations
             - WS agent routing + event tagging
             - AgentSidebar + message attribution UI
             - Phase B plan dispatching to Phase D agents
```

---

## Risk Register

| Risk | Mitigation |
|---|---|
| OAuth token expiry (~1h) | On 401 from CLI subprocess, clear token and emit `oauth_expired` WS event; frontend prompts user to reconnect |
| Multi-agent cost explosion | Phase D inherits Phase A spending limits; per-agent budget caps can be added as an extension to `workspace_spending` |
| Memory pressure from multiple subprocesses | Each Claude Code subprocess is ~150MB; default cap of 4 agents per session, configurable via admin settings |
| Phase D breaks session recording | `SessionRecording.tsx` needs `agentId` grouping/filter — include in Phase D test requirements, not an afterthought |
| Per-agent `--resume` continuity | Each `session_agents` row stores its own `claude_session_id`; `AgentRunner` uses it for `--resume` flag — already in schema |
| Blocklist enforcement with multiple agents | `getBoundaryBlocklist()` check in `handleSdkMessage` applies per-runner; no change needed — each runner enforces independently |
