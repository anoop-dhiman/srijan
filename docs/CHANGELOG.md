# Srijan Changelog

## Phase 10 — claudecodeui Feature Integration (2026-03-24)

### New Features

**Chat UX**
- `PermissionBanner` — inline Approve/Deny when agent awaits confirmation (confirm mode)
- `TokenPie` — SVG context-window usage ring next to agent status; fed by new `usage_update` WS event
- `@file mentions` — type `@` to fuzzy-search workspace files and insert paths into the composer
- Slash commands — `/clear`, `/compact`, `/new`, `/help` triggered by `/` with keyboard-navigable menu
- Thinking mode selector — None / Low (4k) / Medium (16k) / Extended (64k) thinking token budget per message

**Backend / Infrastructure**
- `GET|POST|DELETE /forge/api/mcp` — MCP server management via `claude mcp` CLI
- `GET /forge/api/workspaces/:name/diff?path=` — git diff (HEAD vs working copy) for any file
- `POST /forge/api/git/:name/stage|unstage|commit` — per-file staging and commit
- `GET /forge/api/push/vapid-public-key`, `POST|DELETE /forge/api/push/subscribe` — VAPID web push
- `push_subscriptions` DB table; `lib/webPush.ts` for VAPID key management and push delivery
- Runner emits `usage_update` WS event after every result (inputTokens, outputTokens, costUsd)
- Runner accepts `thinkingBudget` per `sendMessage()` call → `--max-thinking-tokens` CLI flag
- `initWebPush()` called at server startup to ensure VAPID keys are initialized

**Settings**
- MCP Servers section — list, add (name + command + args), remove configured MCP servers
- Desktop Notifications toggle — enable/disable VAPID push; shows "Not supported" gracefully

**Dashboard**
- Git staging panel in WorkspaceCard — file checkboxes, commit message input, Commit button
- Responsive card grid (1 col mobile → 2 col md → 3 col lg)

**File Browser**
- Diff toggle button — switches Monaco to DiffEditor (side-by-side vs HEAD)

**Mobile / PWA**
- `MobileNav.tsx` — fixed bottom nav bar (Dashboard / Chat / Files / Terminal / Settings), `md:hidden`
- `public/manifest.json` — PWA manifest; app installable to home screen
- `public/sw.js` — service worker: cache-first shell, push notification display, notificationclick handler
- `index.html` — manifest link, theme-color meta, SW registration script

### Bug Fixes
- `usage_update` added to `EventType` union (removed `as any` workaround)
- `IAgentRunner.sendMessage` updated to accept optional `thinkingBudget` parameter
- `thinkingBudget` threaded through `chat.ts` WS handler → `runner.sendMessage()`
- `sendPushToSession` called from runner on agent completion and error
- `initWebPush()` wired into server startup sequence

### Tests
- Backend: 325 tests, 29 files (added git staging, diff, MCP, push, runner thinking budget, usage_update)
- Frontend: 290 tests, 16 files (added TokenPie, PermissionBanner, ThinkingModeSelector, CommandMenu, useSlashCommands, MCP settings, push settings, FileBrowser diff, Dashboard staging, MobileNav, App responsive)
- E2E: 10 new spec files covering all Phase 10 features (Playwright)
