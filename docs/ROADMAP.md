# Srijan — Feature Roadmap (claudecodeui Integration)

_Prepared: 2026-03-24_

This document tracks the plan to bring high-value features from claudecodeui (CloudCLI UI) into Srijan.
Features are organized into phases ordered by value-to-effort ratio.

---

## Phase Overview

| Phase | Theme | Key Deliverables |
|---|---|---|
| **P1** | Chat UX polish | Per-tool permission UI, token pie, @file mentions |
| **P2** | Infrastructure control | MCP management, thinking mode selector, slash commands |
| **P3** | Git workflow | Staging/commit UI, diff viewer in file editor |
| **P4** | Cloud notifications | Web push (VAPID), agent completion alerts |
| **P5** | Mobile & PWA | Responsive layout, PWA manifest, mobile nav |

---

## Phase 1 — Chat UX Polish

### 1A. Per-Tool Permission Approval UI

**Problem**: Srijan's "confirm mode" (`--permission-mode default`) pauses the agent but the browser shows
no actionable UI — users don't know what's waiting or why.

**Solution**: Show an inline banner above the chat composer whenever Claude requests a tool that needs
approval. Buttons: "Allow once", "Allow & remember", "Deny".

**Backend changes**
- `runner.ts`: When agent emits a `tool_use` event in confirm mode, emit a `permission_request` WS event
  carrying `{ requestId, toolName, toolInput }`.
- New WS message type `permission_response` from client → `{ requestId, allow: bool }`.
- Pass decision to `proc.stdin` (Claude Code reads JSON approval responses on stdin in confirm mode).

**Frontend changes**
- `useChat.ts`: Handle `permission_request` events → accumulate in `pendingPermissions` state.
- New component `PermissionBanner.tsx` in `src/components/`:
  - Renders per pending request with tool name, collapsible input preview.
  - "Allow once" → sends `permission_response { allow: true }`.
  - "Allow & remember" → also adds rule to agent_boundaries blocklist allowlist in DB.
  - "Deny" → sends `permission_response { allow: false }`.
- Render `<PermissionBanner>` in `Chat.tsx` between messages pane and composer.

**Acceptance criteria**
- In confirm mode, each tool invocation shows the banner before proceeding.
- Allow/deny decisions resolve the pending tool call.
- "Allow & remember" persists so the same tool doesn't prompt again in the session.

---

### 1B. Token Usage Pie (Context Window Indicator)

**Problem**: Users have no visibility into how full the context window is. Long sessions silently
approach the limit, causing degraded agent behavior.

**Solution**: Show a small SVG pie chart next to each assistant message indicating
`tokens_used / context_window_size`. Color: blue < 50%, amber < 75%, red >= 75%.

**Backend changes**
- `runner.ts`: Extract `usage` from `result` event (already done for cost tracking). Also include
  `usage` in `agent_event` payload for individual messages so the frontend can render per-turn.
- Ensure `input_tokens`, `output_tokens`, and `cache_*` fields are forwarded in the WS event.

**Frontend changes**
- New component `TokenPie.tsx` — pure SVG, ~40 lines, no dependencies.
- `useChat.ts`: Track cumulative token count across the session from `agent_event` usage fields.
- Render `<TokenPie used={cumulativeTokens} total={200000} />` in each assistant message bubble.
- Show model context limit (hard-code per model, or read from a `/api/config` field).

**Acceptance criteria**
- Each assistant message shows a pie indicator.
- Color changes correctly at 50% and 75%.
- Tooltip shows raw token numbers on hover.

---

### 1C. @File Mentions in Chat Composer

**Problem**: Users have to manually type file paths. No discoverability of workspace files from the
chat input.

**Solution**: Type `@` in the message textarea → dropdown of files in the active workspace → selecting
a file inserts its relative path. Agent receives the mention naturally as text.

**Backend changes**
- None — `GET /api/workspaces/:name/files` already returns the file tree.

**Frontend changes**
- New hook `useFileMentions.ts`:
  - Fetches file tree for active workspace on mount (lazy, cached).
  - Detects `@` trigger in textarea value.
  - Filters flat file list with fuzzy match on remaining text after `@`.
  - Returns `{ mentionActive, mentionQuery, suggestions, selectSuggestion }`.
- New component `FileMentionDropdown.tsx` — absolute-positioned overlay below cursor.
- Wire into `Chat.tsx` composer textarea: `onKeyDown` navigation, `onSelect` inserts path.

**Acceptance criteria**
- Typing `@` opens dropdown populated with workspace files.
- Arrow keys navigate, Enter/Tab selects, Escape closes.
- Selected file path is inserted inline at cursor position.
- Works for both new messages and edits.

---

## Phase 2 — Infrastructure Control

### 2A. MCP Server Management UI

**Problem**: Users configure MCP servers via the `~/.claude` config file manually. Srijan has no UI
for this, so MCP-dependent workflows require leaving the browser.

**Solution**: New "MCP" section in Settings that lists configured MCP servers and allows adding/removing
them via `claude mcp` CLI commands.

**Backend changes**
- New route file `routes/mcp.ts`:
  - `GET /api/mcp` — runs `claude mcp list`, returns parsed server list.
  - `POST /api/mcp` — runs `claude mcp add <name> <command> [args]`.
  - `DELETE /api/mcp/:name` — runs `claude mcp remove <name>`.
- Requires `claude` CLI to be on `PATH` (it is, since Srijan already spawns it).
- Register in `server.ts`.

**Frontend changes**
- New `McpSettings` section in `Settings.tsx` (inline, consistent with other sections).
- Table of servers: name, command, args, status indicator, remove button.
- "Add server" inline form: name, command, arguments (repeatable), env vars (key-value pairs).
- On add/remove, refresh server list.

**Acceptance criteria**
- Settings MCP section lists all currently configured MCP servers.
- Add form creates a new server and it appears in list.
- Remove button deletes and removes from list.
- Errors (CLI not found, duplicate name) shown inline.

---

### 2B. Thinking Mode Selector

**Problem**: No way to control Claude's extended thinking budget per session. Users doing simple
tasks pay for unnecessary thinking; complex tasks get insufficient budget.

**Solution**: Dropdown or segmented control in the chat header to select thinking mode:
Auto / Low (4k) / Medium (16k) / Extended (64k). Maps to `--max-thinking-tokens` flag.

**Backend changes**
- `runner.ts`: Accept optional `thinkingBudget` param when spawning. Add
  `--max-thinking-tokens <n>` to CLI args when set.
- WS `new_session` / `message` messages: accept `thinkingMode` field and pass through.

**Frontend changes**
- New `ThinkingModeSelector.tsx` — segmented button group: Auto | Low | Medium | Extended.
- Persist selection in `localStorage` per workspace.
- Pass mode with each message sent via WS.

**Acceptance criteria**
- Selector visible in chat header.
- Changing mode takes effect on the next message sent.
- Setting persists across page reloads.

---

### 2C. Slash Commands in Chat

**Problem**: No power-user shortcuts in the chat composer. Common actions (clear context, compact
conversation, etc.) require navigating to other UI areas.

**Solution**: Type `/` in composer → command palette overlay with available commands.

**Initial command set**
- `/clear` — clear chat display (local only)
- `/compact` — send a "summarize and compact" instruction to the agent
- `/new` — start a new session in current workspace
- `/help` — show available commands

**Frontend changes**
- New hook `useSlashCommands.ts`: detects `/` trigger, filters command list, handles selection.
- New component `CommandMenu.tsx` — dropdown overlay, keyboard navigable.
- Wire into Chat.tsx composer.

**Acceptance criteria**
- `/` opens the command menu.
- Arrow + Enter selects, Escape closes.
- Each command executes its action correctly.

---

## Phase 3 — Git Workflow Completion

### 3A. Git Staging & Commit UI

**Problem**: Srijan's Dashboard shows git status (branch, remote) and supports push/pull but users
cannot stage files or write commits without leaving the browser.

**Solution**: Expand the GitSection in WorkspaceCard with a staging view: changed files list with
checkboxes, commit message input, commit button.

**Backend changes**
- `git/manager.ts`:
  - `getStatus(name)` — extend to return porcelain status per file (staged/unstaged/untracked).
  - `stageFiles(name, paths[])` — runs `git add <paths>`.
  - `unstageFiles(name, paths[])` — runs `git restore --staged <paths>`.
  - `commitChanges(name, message)` — runs `git commit -m <message>`.
- `routes/git.ts`:
  - `GET /:name/status` — already exists, extend response with per-file status.
  - `POST /:name/stage` — `{ paths: string[] }`.
  - `POST /:name/unstage` — `{ paths: string[] }`.
  - `POST /:name/commit` — `{ message: string }`.

**Frontend changes**
- `Dashboard.tsx` GitSection: add "Changes" tab alongside existing remote/push controls.
- File list with staged/unstaged grouping, checkboxes to toggle.
- Commit message textarea + Commit button.
- After commit, refresh git status; show success/error inline.

**Acceptance criteria**
- Changed files listed with status (M, A, D, ?).
- Stage/unstage individual files or all at once.
- Commit creates a git commit with provided message.
- Status refreshes automatically after commit.

---

### 3B. Diff Viewer in File Editor

**Problem**: The Monaco editor in FileBrowser shows the current file but not what changed vs HEAD.
Users need to open a terminal to `git diff`.

**Solution**: Add a "Diff" toggle in the file editor header. When active, split the Monaco editor
into diff view (original from `git show HEAD:<file>` vs working copy).

**Backend changes**
- `routes/files.ts`: New `GET /api/workspaces/:name/diff?path=<file>` — returns
  `{ original: string, current: string }` (original from `git show HEAD:<path>`).

**Frontend changes**
- `FileBrowser.tsx`: "Diff" button in editor header.
- When toggled, switch Monaco instance to `DiffEditor` (already in `@monaco-editor/react`).
- Fetch `/diff` endpoint for original content.

**Acceptance criteria**
- Diff button visible when a file is open.
- Clicking shows side-by-side diff against HEAD.
- Clicking again returns to normal editor.
- Unchanged files show empty diff.

---

## Phase 4 — Cloud Notifications

### 4A. Web Push Notifications (VAPID)

**Problem**: Srijan runs agents in the cloud — users close the tab while tasks run. No mechanism
to alert them when the agent finishes or needs input.

**Solution**: Browser push notifications using the Web Push API (VAPID). Notify on:
- Agent session completed
- Agent awaiting permission approval (confirm mode)
- Agent error

**Backend changes**
- Add `web-push` npm package.
- New `src/lib/webPush.ts`: generate/persist VAPID keys in DB, `sendNotification(userId, payload)`.
- New `routes/push.ts`:
  - `GET /api/push/vapid-public-key` — returns public key for client subscription.
  - `POST /api/push/subscribe` — store `PushSubscription` in new `push_subscriptions` table.
  - `DELETE /api/push/subscribe` — remove subscription.
- `runner.ts`: On session end/error, call `sendNotification` for the session's user.
- DB migration: `push_subscriptions` table (`user_id`, `endpoint`, `keys_json`).

**Frontend changes**
- `src/lib/pushNotifications.ts`: `requestPermission()`, `subscribeToPush(vapidKey)`,
  `unsubscribe()`.
- `public/sw.js`: Service worker with `push` event handler → `showNotification`.
- Settings toggle "Desktop notifications" in Security/Notifications section.
- On enable: request permission → POST subscription to server.

**Acceptance criteria**
- Enabling notifications requests browser permission.
- Agent completion sends a push notification even when tab is closed.
- Permission request in confirm mode triggers a notification with "Open Srijan" action.
- Notifications link back to the relevant session when clicked.

---

## Phase 5 — Mobile & PWA

### 5A. Mobile-Responsive Layout

**Problem**: Srijan's layout is desktop-only. The sidebar, Dashboard cards, and chat pane don't
adapt to small screens.

**Solution**: Add responsive breakpoints and a mobile bottom navigation bar. Sidebar collapses to
hidden below `md` breakpoint. Tab nav moves to a bottom bar on mobile.

**Frontend changes**
- `App.tsx`: Add `useMediaQuery` hook; on mobile, hide sidebar, show bottom nav.
- New `MobileNav.tsx`: bottom bar with icons for Dashboard / Chat / Files / Terminal.
- `Chat.tsx` sidebar: responsive — slide-in drawer on mobile, triggered by hamburger.
- `Dashboard.tsx`: WorkspaceCards stack full-width on mobile.
- `FileBrowser.tsx`: Collapse file tree to drawer on mobile.

**Acceptance criteria**
- All views usable on 375px width.
- Bottom nav visible on mobile, hidden on desktop.
- Sidebar accessible via drawer on mobile.
- No horizontal scroll on any view.

---

### 5B. PWA Manifest & Service Worker

**Problem**: No PWA support — can't install Srijan to home screen or cache for offline shell.

**Solution**: Add `manifest.json`, icons, and a minimal service worker for shell caching.

**Changes**
- `platform/web/public/manifest.json`: name, icons, theme color, `display: standalone`.
- `platform/web/public/sw.js`: cache-first strategy for app shell (HTML/JS/CSS).
- `platform/web/index.html`: link manifest, theme-color meta tag.
- Vite config: register service worker plugin (`vite-plugin-pwa` or manual).

**Acceptance criteria**
- Chrome shows "Install" prompt.
- Installed app opens in standalone mode.
- App shell loads from cache when network is slow.

---

## Non-Goals (Explicitly Deferred)

| Feature | Reason |
|---|---|
| Multi-provider (Cursor, Codex, Gemini) | Orthogonal to Srijan's value prop; massive architecture change |
| Plugin system | Multi-user model complicates sandboxing; not a current need |
| i18n / internationalization | Not a priority until post-launch |
| `~/.claude` session auto-discovery | Srijan owns workspace lifecycle; this pattern doesn't apply |
| TaskMaster AI integration | Third-party dependency; evaluate separately |

---

## Summary Timeline

```
Phase 1 (Chat UX)         ████████░░░░░░░░░░░░░░░░░░░░░░
  1A Permission UI         ████░░
  1B Token Pie             ██░░
  1C @File Mentions        ████░░

Phase 2 (Infrastructure)  ░░░░░░░░████████░░░░░░░░░░░░░░
  2A MCP Management        ██████░░
  2B Thinking Mode         ████░░
  2C Slash Commands        ████░░

Phase 3 (Git)             ░░░░░░░░░░░░░░░░████████░░░░░░
  3A Staging & Commit      ██████░░
  3B Diff Viewer           ████░░

Phase 4 (Notifications)   ░░░░░░░░░░░░░░░░░░░░░░░░████░░
  4A Web Push              ████░░

Phase 5 (Mobile/PWA)      ░░░░░░░░░░░░░░░░░░░░░░░░░░████
  5A Responsive Layout     ████░░
  5B PWA Manifest          ██░░
```

---

## Test Coverage Requirements

Each phase must maintain or improve test counts:
- Backend: `cd platform && npm test` — no regression from current 284 tests
- Frontend: `cd platform/web && npx vitest run` — no regression from current 196 tests
- New routes require route-level tests in `platform/src/__tests__/`
- New React components require component tests in `platform/web/src/`
