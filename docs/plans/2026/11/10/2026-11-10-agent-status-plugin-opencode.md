# Agent Status: OpenCode plugin

**Date**: 2026-11-10
**Status**: Done (installed; new code loads in new opencode processes — running daemons keep the old instance until restart)
**Parent**: [`2026-11-10-agent-status-live-broadcast.md`](2026-11-10-agent-status-live-broadcast.md)

Module: `src/notifyhub/plugins/opencode/` (`notifyhub-plugin.ts`).

## Goal

Port herdr's opencode integration design (`_refs/herdr/src/integration/assets/opencode/herdr-agent-state.js`):
the resident plugin is the **lifecycle authority** because it sees the server's own event stream;
report state transitions in-process (no spawn) to `POST /api/status/opencode/<state>`.

## What changed

- `reportStatus(ctx, sessionID, state)`: dedups identical consecutive states per session
  (`lastPostedState`), resolves the owning directory via the existing `ownedSessionDirectory`
  guard (one plugin instance loads per location; only the owner handles a session), and POSTs
  `{session_id, pwd, host, task?}` with a 3s `AbortSignal.timeout`. Failures are silent; the
  local cache still flips so the *next* transition isn't skipped as a duplicate.
- On `running` transitions only, it fetches `ctx.session.context()` and attaches the same
  `[#tag:@USER]`-style truncated user text (`truncateText([lastUserText(...)])`) as the `task`
  excerpt. Later transitions in the same turn send no `task`, so the server keeps the first one.
- Event map (verified against `@opencode/schema` types and the shipped binary):
  - `session.execution.started` → **running**
  - `session.idle` → **idle** (arrival-ordered; harmless double with execution end thanks to dedup)
  - `session.execution.succeeded/failed/interrupted` → **idle** (+ existing notifications)
  - `permission.asked` / `form.created` → **blocked** (+ existing notifications)
  - `permission.replied` → **running** (once/always resume; reject settles via the following idle)
- `notifyhubPush(message, directory, sessionID?)` — spawns the shared push script with
  `NOTIFYHUB_SESSION_ID` so completions correlate.
- Endpoint resolution mirrors the CLI: `NOTIFYHUB_CLI_SCHEME/HOST/PORT` with default-port
  collapsing (`https`+`443` → `https://host/api/status`).
- No `tool.execute` heartbeat exists in `@opencode/plugin` 2.0.18 — an attempted refresh hook
  was dropped rather than shipped unverified (any lifecycle event refreshes `updated` anyway).

## Trials, errors, lessons

### The daemon ran the old plugin (parent doc §5)

`opencode run` posted nothing while `opencode plugin list` showed the new file. A throwaway
debug plugin (append every event to `/tmp/opencode/events.log`) proved the event stream was
fine — the persistent server process just held the previously-loaded instance. It also revealed
**5 plugin instances** (one per location) each receiving every event — cross-talk is prevented
by `ownedSessionDirectory`, duplicates by state dedup + server-side change detection.

**Lesson**: disk state ≠ running state for resident plugins. Prove your new code executes
(a debug plugin that logs to a file beats guessing) before debugging its logic.

### `opencode run` never notifies from a foreign directory — and that's correct

The location guard skipped the synthetic test sessions (they were spawned under `/tmp` while the
owning instance's location differed). Same guard the notification path has always had; not a bug.
Real sessions in real project dirs reported immediately (hanoi-testing-platform, bach).

### Plugin API surface: verify against installed types, not the website

`session.idle` / `permission.replied` / `session.execution.*` were confirmed in
`node_modules/@opencode/schema/dist/*.d.ts` and by grepping the `opencode` binary for event
literals before writing the switch — docs pages drift across v2 minor versions.

## Verification

- `tsc --noEmit` clean; installed via `make install-plugin-copy`.
- Real sessions reporting live (idle entries verified on the nuc store after finishing turns).
