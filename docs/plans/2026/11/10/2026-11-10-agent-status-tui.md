# Agent Status: TUI live dock

**Date**: 2026-11-10
**Status**: Done (verified against the live nuc backend)
**Parent**: [`2026-11-10-agent-status-live-broadcast.md`](2026-11-10-agent-status-live-broadcast.md)

Module: `src/notifyhub/tui/` (`hooks/useNotifications.ts`, `utils/api.ts`, `utils/crypto.ts`,
`components/AgentStatusDock.tsx` [new], `App.tsx`, `types.ts`).

## Goal

Show *sessions in motion* above the notification stream — the "notification card with a loading
animation while a chat is on": a spinner row appears when a turn starts, turns into a
waiting/stalled marker when appropriate, and disappears when the turn's completion notification
lands (matched by session id).

## What changed

- **`AgentStatusDock`** (new): bordered dock above the notification stream. Non-idle entries,
  newest-updated first. Per row:
  - running → animated braille spinner (`⠋⠙⠹…`, 120ms) + `◇ opencode · dirname · since (task excerpt)`
  - blocked → `⚠ claude · waiting for you`
  - stale → `◼ codex · stalled?` (client-side mirror: running + `updated` older than 5 min, so
    the marker appears even between SSE events)
  - agent glyphs ◇/✳/◐, directory color from the existing `getAvatarColor` hash.
- **`useNotifications`**: handles the new `agent_status` SSE event — decrypts the payload
  (envelope or plain), structurally validates, upserts per `session_id`. When a *notification*
  arrives whose decrypted `data.session_id` matches a dock row, the row is dropped (the card
  replaces the spinner). On SSE (re)connect it resyncs from `GET /api/status` (missed events
  aren't replayed).
- **`utils/api.ts`**: `fetchAgentStatus()` — GET, per-entry e2e decrypt, undecryptable entries
  *dropped* (unlike notifications, which render a LOCKED card — the dock is ephemeral display
  state, not data to recover); `isStatusEntry()` structural guard (also fixed a `TS2352` by
  validating before casting).
- **`utils/crypto.ts`**: exported the existing `ensureKey()` (was module-private).
- **App.tsx**: `<AgentStatusDock entries={agentStatus} now={useNow(10s)} />` above the stream.

## Trials, errors, lessons

### Function-call testing doesn't work for opentui components

First version of the dock test called `AgentStatusDock({...})` directly → render errors. The
codebase's own pattern (`NotificationRow.test.tsx`) is `testRender(<Component …>)` +
`captureCharFrame()` — assert on the *character frame*, not the returned tree.

**Lesson**: copy the module's established test harness; opentui components need a renderer.

### Type-check noise vs real errors

`bun run typecheck` fails repo-wide on missing `@types/node` / `bun:test` types (pre-existing —
verified identical on a clean stash). Filtering to my files showed two genuine `TS2352`s from
casting decrypted JSON; fixing them with a structural guard (`isStatusEntry`) instead of
`as unknown as` made the runtime paths safer too.

### Status decryption ≠ notification decryption

Notifications must never be lost → LOCKED rows. Status is recomputed every event → drop instead
of lock. Choosing different failure policies per data type (rather than reusing the notification
pattern blindly) is the actual design decision here.

### useNow for the stale mirror

Relative times and the client-side stale marker need a ticking clock; `useNow(10s)` already
existed for `formatRelativeTime`. The dock reuses it, so all rows re-evaluate together.

## Verification

- `bun test`: 132 pass, incl. 3 new dock tests (running row renders agent/dir/task; blocked +
  stalled markers; idle hidden).
- Live: entries from real opencode/claude sessions render and resolve (session-id match
  verified server-side: notification `929b8c82…` == status `929b8c82…`).
- `make tui` on this machine against the nuc backend shows the dock during real turns.
