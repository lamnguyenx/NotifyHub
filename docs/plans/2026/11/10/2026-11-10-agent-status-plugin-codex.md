# Agent Status: Codex hooks

**Date**: 2026-11-10
**Status**: Done (installed in `~/.codex/hooks.json`, verified end-to-end via `codex exec`)
**Parent**: [`2026-11-10-agent-status-live-broadcast.md`](2026-11-10-agent-status-live-broadcast.md)

Module: `src/notifyhub/plugins/codex/` (`notifyhub-codex.py`, `install.py`, `hooks/hooks.json`).

## Goal

Same as the claude port, for OpenAI Codex: hooks-only lifecycle reporting with no python on the
prompt path.

## What changed

Status mapping:

| Hook | State | Path |
|---|---|---|
| `UserPromptSubmit` | running | **inline `sh -c 'curl …/running'`** (`cmd /c curl …` on Windows), `async: true, timeout: 3` |
| `PostModelRequest` (any attempt/status) | running — heartbeat that also revives stale entries | `notifyhub-codex.py` |
| `PermissionRequest` | blocked **only when a human must decide**; `running` for `auto_review`/never | python script (`needs_human_permission` reused) |
| `PreToolUse` (`request_user_input`) | blocked | python script |
| `Stop` / `Interrupt` | idle | python script (already synchronous — see below) |
| `Stop` with `stop_hook_active` | (unchanged) | — |

- `status_event()` / `post_status()`: same shape as the claude script (proxy-free urllib opener,
  2s timeout, NOTIFYHUB_CLI_* resolution, mute rules).
- `push()` gained the explicit `session_id` param, passed from `main()`.
- `install.py`: `UserPromptSubmit` via `status_curl_handler()` (defined **before** `HOOK_EVENTS`
  — a python module executes top-to-bottom, unlike hoisted shell functions); uninstall matches
  `/api/status/codex/` commands too.
- `hooks/hooks.json` (plugin layout) resynced with `UserPromptSubmit`; `tests/notifyhub/plugins/
  test_codex_hooks.py::TestPluginLayout` updated to pin the six-event contract.
- Windows: `commandWindows` uses `%VAR%` expansion via `cmd /c` (no `${VAR-default}` semantics
  there — the documented mute on Windows stays "unset the vars"? no: empty curl URL fails fast
  and errors are swallowed, so behavior degrades to no-op, which is the same outcome).

## Trials, errors, lessons

### "Unknown `UserPromptSubmit`" risk — verify the binary, not docs

Before wiring, `strings ~/.local/bin/codex | grep -x UserPromptSubmit` confirmed the hook exists
in the installed build (8 hits) alongside `hooks.json`/`hook_event_name` support. Codex hook
names are learned best from the binary you run.

### `auto_review` permissions are not blockers

This machine's `~/.codex/config.toml` sets `approvals_reviewer = "auto_review"` — its guardian
approves without the user. Blindly mapping `PermissionRequest → blocked` would false-alarm on
every approval; reusing the notification path's `needs_human_permission()` (transcript
`turn_context` check) keeps the status truthful.

### Sync-vs-async was already right here

Stop/Interrupt/PostModelRequest were synchronous from the earlier codex port precisely because
`codex exec` cancels background hooks — this session only *added* to that design (and copied the
same fix to claude). The lesson landed in the claude doc; here it's the inheritance.

### Trust bookkeeping moves

Adding `UserPromptSubmit` to `hooks.json` changes Codex's trust hashes; a TUI session may prompt
to re-trust via `/hooks`. `codex exec` ran without ceremony. Documented in the README/operator
doc, worth knowing after any installer re-run.

## Verification

- pytest green (incl. new `TestStatusEvents` + installer strip + plugin-layout contract tests).
- Live: `codex exec --skip-git-repo-check` full cycle → `idle`, correct pwd, hostname reported.
