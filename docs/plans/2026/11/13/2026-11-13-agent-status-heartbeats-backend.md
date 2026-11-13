# Backend: agent-status heartbeat flag

**Date**: 2026-11-13
**Status**: Done
**Parent**: [`2026-11-13-agent-status-heartbeats.md`](2026-11-13-agent-status-heartbeats.md)

Module: `src/notifyhub/backend/` (`models.py`, `backend.py`); tests in
`tests/notifyhub/backend/test_status.py`.

## Goal

Reporters needed a way to say "this session is still alive" that could never
corrupt lifecycle state. Without it, claude/codex watchers refreshing `running`
would race the turn's own `idle`/`blocked` reports: a straggler ping after
`Stop` would resurrect a finished session's card, and a ping during a
permission wait would flip an amber card back to shimmering.

## What changed

- `AgentStatusStore.update(..., heartbeat: bool = False)`:
  - `heartbeat=True` **never creates an entry** — the first report of a turn
    is always a real transition carrying the task excerpt; pings cannot
    conjure cards (notably after a backend restart, when no entries exist);
  - on a non-`running` entry it is a silent no-op (returns `False`) — this is
    the race guard;
  - on a `running` entry it refreshes `updated` only; if the previous report
    was older than `stale_after`, the existing "refreshed late re-announces"
    path fires, so a heartbeat revives a stale entry exactly like any late
    real refresh.
- `POST /api/status/{agent}/{state}` passes `heartbeat=body.get("heartbeat")
  is True` through. Only the strict boolean counts — truthy strings do not.

## Why server-side (and not client sequencing)

The alternative was clients pausing/precisely ordering pings around state
transitions — fragile forever, and impossible for the detached watchers whose
whole point is independence from hook timing. A ping that the server treats as
"liveness only" makes every race a no-op by construction.

## Verification

`tests/notifyhub/backend/test_status.py`: heartbeat never creates; refreshes
without re-announcing; revives a stale entry; cannot unblock `blocked` or
resurrect `idle`; a real (non-heartbeat) `running` post still flips `blocked`
(protects claude `PostToolUse`'s answered-permission path); API-level test
repeats create/no-op semantics through the route.

## Lessons

- The existing `refreshed_late` logic (built for event refreshes) was reused
  as-is for heartbeats — no new staleness code paths to test or reason about.
- Adding a mode to an existing endpoint via one boolean kept the API surface
  unchanged for every existing reporter; old payloads are simply non-heartbeats.

Not performed: load testing under many concurrent reporters; expected volume
(1 POST/min/session) sits far below any concern.
