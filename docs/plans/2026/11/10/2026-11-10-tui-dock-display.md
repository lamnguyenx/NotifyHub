# TUI agent status dock: status only, no task text

**Date**: 2026-11-10
**Status**: Done
**Parent**: [`2026-11-10-tui-startup-transport-layout.md`](2026-11-10-tui-startup-transport-layout.md)
**Origin**: the dock introduced in [`2026-11-10-agent-status-tui.md`](2026-11-10-agent-status-tui.md) / commit `b0d1766`.

Module: `src/notifyhub/tui/src/components/AgentStatusDock.tsx` (+ its test).

## Goal

The user wanted the dock to show **whether an agent is running / blocked / stalled**, not what
it is working on. Rows previously appended a 120-char task excerpt:

```text
⠙ ◇ opencode · NotifyHub · 2m ago (fix the login redirect bug)
```

Requested:

```text
⠙ ◇ opencode · NotifyHub · 2m ago
```

## What changed

- Removed the `task` variable and the trailing `<text>({task})</text>` from `AgentStatusRow`.
- Removed the now-unused `truncate` import (`NotificationRow` still uses it for paths).
- Updated the dock test from "renders agent, dir and task excerpt" to "renders status only,
  without the task excerpt" and added a **negative assertion** (`not.toContain("fix the flaky test")`)
  so the text cannot silently come back.
- Updated the operator docs (`README.md` §16, `docs/important/the-tui.md`,
  `docs/important/agent-status.md`).

## Decisions

- **Display-only change.** `AgentStatusEntry.task` remains in `GET /api/status`, the
  `agent_status` SSE payload, the backend `AgentStatusStore`, and all reporters. The data is
  still useful for the future web frontend, debugging, and other consumers; only this one view
  stopped rendering it.
- The row still shows directory and elapsed time because those answer "which session, for how
  long", not "what is it doing".
- Blocked/stalled labels (`waiting for you`, `stalled?`) are unchanged.

## Trials, errors and lessons

### "Remove the message" means the rendering, not the API field

Deleting `task` from the type/backend would have been a wider, breaking change for no benefit.
Separate the view's presentation choice from the shared payload contract.

### Assert the absence

A test that only checks the expected text passes even if the excerpt is still appended. The
negative assertion documents the user's requirement and protects it.

### Docs had three copies of the old behavior

`README.md`, `docs/important/the-tui.md`, and `docs/important/agent-status.md` each described
the task excerpt in the dock. Grep the docs for the feature name whenever a display detail
changes; otherwise the operator guide keeps advertising removed behavior.

## Verification

`make tui-test`: 139 pass, 0 fail. The dock render test captures the character frame and asserts
the task string is absent. Rows are `marker + glyph/label + dir + elapsed` only.
