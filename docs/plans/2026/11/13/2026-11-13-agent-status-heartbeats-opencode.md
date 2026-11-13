# OpenCode plugin: running-turn heartbeat ticker

**Date**: 2026-11-13
**Status**: Done
**Parent**: [`2026-11-13-agent-status-heartbeats.md`](2026-11-13-agent-status-heartbeats.md)

Module: `src/notifyhub/plugins/opencode/notifyhub-plugin.ts`; tests in
`tests/notifyhub/plugins/opencode_plugin.test.ts`.

## What changed

- `reportStatus()` split: the HTTP POST moved into a new `postStatus(sessionID,
  state, directory, task?, heartbeat?)`; `reportStatus()` keeps the dedupe,
  directory ownership, and task-excerpt extraction, and additionally maintains
  the new `runningTurns` map (`sessionID → {started, directory}`) as sessions
  transition to/from `running`.
- One `setInterval` per plugin instance (default 60s, `NOTIFYHUB_HEARTBEAT_INTERVAL_MS`,
  1s floor): for each entry in `runningTurns`, post `running` with
  `heartbeat: true`; entries older than the cap (default 120 min,
  `NOTIFYHUB_HEARTBEAT_MAX_MINUTES`, `0` disables both ticker and cap) are
  dropped first.
- The timer is `unref()`'d and cleared (map emptied) in the plugin teardown.

## Design notes

- **Correct instance by construction**: only sessions this instance reported
  `running` are pinged, so the existing location-ownership filter needs no
  re-check per tick (the `pwd` was captured at the real report).
- **No task in pings**: absent `task` never clobbers the stored excerpt
  server-side; pings carry only liveness.
- **Age cap serves the orphan guard**: a session with no real transition for
  hours is dead, not busy — dropping it lets the backend serve `stale`, which
  is the honest state.

## Trials and errors

- The first bun test asserted `posts.at(-1).heartbeat === false` right after
  emitting `session.execution.started` — but the harness `emit()` sleeps 20ms
  internally and the 20ms heartbeat tick landed inside it, so the *last* post
  was nondeterministically the ping. Assert on `posts[0]` instead.
- The age-cap test originally used a 6ms cap with a 20ms interval — flaky by
  construction (margins below scheduler jitter). Rewritten with a 30ms cap /
  10ms interval and a tolerant bound (≤1 straggler tick). Three consecutive
  green full runs are the acceptance bar for timer tests in this suite.

## Verification

Five new bun tests: pings during a long turn and stop at idle; no pings while
blocked (permission wait) and resume on reply; `MAX_MINUTES=0` disables;
aged-out entries stop refreshing; disposal stops pings. Typecheck clean;
`beforeEach` now records the `heartbeat` flag on captured posts and clears the
two env knobs between tests.
