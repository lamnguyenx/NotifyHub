# Codex hooks: python turn-start reporter + detached heartbeat watcher

**Date**: 2026-11-13
**Status**: Done
**Parent**: [`2026-11-13-agent-status-heartbeats.md`](2026-11-13-agent-status-heartbeats.md)

Module: `src/notifyhub/plugins/codex/` (`notifyhub-codex.py`, `install.py`);
hook definitions in [`2026-11-13-agent-status-heartbeats-codex-hooks.md`](2026-11-13-agent-status-heartbeats-codex-hooks.md).

## What changed

Same watcher block as claude (parent/plugins records have the protocol
details), plus codex-specific wiring:

- **`UserPromptSubmit` runs the python reporter on every platform** — the old
  Unix curl one-liner is gone from both `install.py` and the plugin-layout
  `hooks.json`; `status_curl_handler()` remains only as the *legacy shape*
  for uninstall matching, so upgraded installs drop the stale entry in place.
  This is also what finally makes Unix/Windows turn-start identical.
- **`PostModelRequest` re-arms the watcher**: it is already a `running` event
  refresh, and now also calls `start_heartbeat` — a watcher that aged out
  mid-turn (long approval wait) restarts on the next model request, within
  the same turn.
- **Bug fixed**: `notification_body()` returned the literal string `"running"`
  for `UserPromptSubmit`. On Windows (the only path where the py script
  handled that event) this pushed a notification that read `running`. Now
  `None` — the event is status-only, and a regression test pins it.
- `post_status` gained the `heartbeat` flag alongside its existing prompt
  forwarding (which the Windows reporter already had).

## Trials and errors

- The `"running"` literal bug was found by *reading* the notification-body
  mapping while rewiring it, not by a failing test — worth the pinning test
  now that the event reaches more platforms.
- The inverted-loop and `str`-vs-`Path` errors (parent record) both surfaced
  in this module's tests first — it shares the watcher block with claude, so
  codex's copies of those tests failed identically and confirmed the fixes
  in both files.

## Verification

`TestHeartbeat` mirrors claude's (flag+prompt body, claim/spawn-once, alive
skip, dead steal, unsafe ids, stop unlink+verified-kill, loop-until-lease-gone,
age cap, missing lease silent); installer tests assert the py-handler
turn-start wiring, that legacy curl entries are replaced, and that
`PostModelRequest` re-arms via `main()` ordering (idle stops before
anything posts). Layout tests assert `hooks.json` carries no curl command.

## Rollout note

The installed `UserPromptSubmit` definition string changed (curl → python),
so existing installs must **re-trust via `/hooks`** — Codex keys trust on the
definition, not the script content.
