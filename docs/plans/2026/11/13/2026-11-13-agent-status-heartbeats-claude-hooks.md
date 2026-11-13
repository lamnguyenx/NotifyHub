# Claude hook definitions: turn-start python, per-tool curl

**Date**: 2026-11-13
**Status**: Done
**Parent**: [`2026-11-13-agent-status-heartbeats-claude.md`](2026-11-13-agent-status-heartbeats-claude.md)

Module: `src/notifyhub/plugins/claude/hooks/` (`hooks.json`) and the
installer's matching `HOOK_EVENTS` in `install.py`; README updated.

## What changed

- `UserPromptSubmit`: curl one-liner → `${CLAUDE_PLUGIN_ROOT}/notifyhub-claude.py`
  (async, no timeout field — matches the plugin-layout schema that worked for
  the other async entries). One prompt per turn is a cold path; the ~50ms
  interpreter start buys label precedence, prompt forwarding, and the
  detached watcher spawn.
- `PostToolUse`: **unchanged curl one-liner**. It is the hot path (fires per
  tool call, potentially every few seconds), and it carries real semantics a
  ping must not have: flipping `blocked → running` when you answer a
  permission. A heartbeat flag there would have *removed* that behavior; no
  python start is worth losing the hot-path cost argument either.
- README section renamed to "Running status, machine labels, and the heartbeat
  watcher" documenting the split and the lease directory/knobs.

## Lesson: hot path vs cold path is a wiring decision

The 2026-11-11 host-header design kept *both* running hooks as curl for one
reason — interpreter startup on `PostToolUse`. This change is the first to
split them by cadence: turn start (cold, feature-rich python) vs per-tool
(hot, dumb pipe). Keeping the distinction explicit in both JSON files and the
README is what stopped a "consistent-looking" refactor from accidentally
putting python on the per-tool path.

## Verification

Installer tests: `UserPromptSubmit` py+async, `PostToolUse` still curl with
host header and `${VAR-default}` mute semantics; idempotent merge; strip
removes both. Layout test pins `hooks.json` to the exact same split.
`test_machine_labels.py` now executes the real curl command only for
`PostToolUse`.
