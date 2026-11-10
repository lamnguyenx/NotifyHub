# Agent Status: CLI session-id passthrough

**Date**: 2026-11-10
**Status**: Done (live on this machine via `make install-plugin-copy`)
**Parent**: [`2026-11-10-agent-status-live-broadcast.md`](2026-11-10-agent-status-live-broadcast.md)

Module: `src/notifyhub/cli/` (`cli.py`).

## Goal

Make every completion notification correlate 1:1 with its live status entry by stamping the
agent session id onto the pushed payload.

## What changed

One block in `main()`: if `NOTIFYHUB_SESSION_ID` is set in the environment, the POST body gains
`data.session_id`. That's the whole change.

The point is *who* sets that env var — nobody types it:

| Push producer | How session_id reaches the CLI |
|---|---|
| claude hook script | `subprocess.run(..., env={**os.environ, "NOTIFYHUB_SESSION_ID": session})` |
| codex hook script | same explicit `env=` passthrough |
| opencode plugin | same key in the `spawn(..., env)` for `notifyhub-push.py` |

## The load-bearing quirk: cli.py IS the push script

`make install-plugin-copy` does `cp src/notifyhub/cli/cli.py ~/.config/opencode/plugin/notifyhub-push.py`.
The "CLI" and the "plugin push script" are the same file — so an env-contract change in
`cli.py` automatically reaches all three integrations on the next `make install-plugin*`, with
no plugin-side edits. (Claude/codex hook scripts spawn that shared copy; the opencode plugin
does too.)

**Lesson**: the CLI's environment contract is *also* the plugins' contract — changing it is a
cross-module release: edit here, `make install-plugin-copy`, and every reporter picks it up.

## Verification

- Manual: `NOTIFYHUB_SESSION_ID=test-ses-1 python3 ~/.config/opencode/plugin/notifyhub-push.py …`
  → stored notification contains `session_id: test-ses-1`.
- Live: `claude -p` turn produced notification `session_id 929b8c82-…` identical to the status
  entry's `session_id` — the exact match the TUI dock resolves rows by.

## Lesson (from the bug found here)

The passthrough was originally implemented by referencing `payload` inside `push()` — out of
scope → `NameError` → every claude/codex completion notification silently died while status
kept working. Caught only by feeding a captured Stop payload to the script manually. See the
claude module doc; keep the synthetic-payload feed in the loop.
