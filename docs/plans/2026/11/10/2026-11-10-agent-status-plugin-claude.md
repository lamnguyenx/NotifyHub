# Agent Status: Claude Code hooks

**Date**: 2026-11-10
**Status**: Done (installed in `~/.claude/settings.json`, verified end-to-end incl. `claude -p`)
**Parent**: [`2026-11-10-agent-status-live-broadcast.md`](2026-11-10-agent-status-live-broadcast.md)

Module: `src/notifyhub/plugins/claude/` (`notifyhub-claude.py`, `install.py`, `hooks/hooks.json`).

## Goal

Report claude session lifecycle to `POST /api/status/claude/<state>` using hooks only (claude has
no in-process event stream), without putting a python startup on any hot path.

## What changed

Status mapping:

| Hook | State | Path |
|---|---|---|
| `UserPromptSubmit` | running | **inline `sh -c 'curl --data-binary @- …/running'`**, `async: true` |
| `PostToolUse` | running (refresh; flips blocked→running after an answered permission) | same curl one-liner |
| `Notification` (permission/elicitation/agent_needs_input) | blocked | `notifyhub-claude.py`, in-process `urllib` POST (proxy-free opener, 2s timeout) |
| `Stop` / `StopFailure` | idle | python script; **now `async: false, timeout: 10`** |
| `Stop` with `stop_hook_active` | (unchanged — turn continues) | — |

- `status_event()` maps payloads→state; `post_status()` resolves `NOTIFYHUB_CLI_HOST/PORT/SCHEME`
  with the same booleanify/empty-string mute semantics as the push CLI.
- `push()` gained `session_id`/`timeout` params: completions spawn the shared push script with
  `NOTIFYHUB_SESSION_ID`, and Stop/StopFailure use `SYNC_PUSH_TIMEOUT = 5` (they now run async:false).
- `install.py`: `UserPromptSubmit`/`PostToolUse` entries via `status_curl_handler()`; uninstall
  (`is_ours`) matches both flavors — the python script *and* `/api/status/claude/` curl commands.
- `hooks/hooks.json` (plugin-distribution layout) resynced to the same five events (Stop/StopFailure
  sync + the two curl hooks) with `${CLAUDE_PLUGIN_ROOT}` paths.
- The curl one-liner uses `${NOTIFYHUB_CLI_HOST-127.0.0.1}` (default, **not** `:-`) so an
  empty-string export still mutes — documented mute contract preserved.

## Trials, errors, lessons

### `claude -p` kills async hooks on exit (parent doc §3)

Symptom: `running` arrived, `idle` never did, for `-p` runs only. Proved Stop *fires* (extra
`stop-fired` log hook), captured the true payload+env with a `cat > file` hook — everything
needed was present; the async child was simply cancelled when the `-p` process exited. The codex
installer had this exact lesson written down already.

**Fix**: Stop/StopFailure `async: false` + capped 5s push spawn. Verified: `-p` turn now lands
running→idle with notification.

**Lesson**: for headless/SDK modes, completion hooks must be synchronous, and your own repo may
already contain the precedent — read sibling module docs first.

### The NameError (parent doc §4)

`session_id = str(payload.get(...))` inside `push()` — `payload` exists only in `main()`.
Status kept working while *all* claude/codex completion notifications silently died.

**Fix**: explicit `session_id` parameter. **Lesson**: verify each output channel independently;
"status works" said nothing about notifications.

### Probing hooks is cheap and definitive

The fastest way to learn what claude actually delivers: temporarily append a hook that dumps
`cat > /tmp/...json` + `env | grep -E "NOTIFYHUB|CLAUDE"`, run one `-p` turn, read it, restore the
settings backup. Two minutes, zero guessing. (Backup `settings.json` before touching it.)

## Verification

- pytest (plugins+backend) green; installer idempotence + strip coverage extended
  (`tests/notifyhub/plugins/test_claude_hooks.py`).
- Live: full `-p` cycle → idle; task excerpt extracted server-side from the piped prompt;
  notification `session_id` == status `session_id`.
