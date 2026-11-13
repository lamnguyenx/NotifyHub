# Tests: heartbeat regression suites

**Date**: 2026-11-13
**Status**: Done
**Parent**: [`2026-11-13-agent-status-heartbeats.md`](2026-11-13-agent-status-heartbeats.md)

Module: `tests/notifyhub/` — backend `test_status.py`, plugin `test_claude_hooks.py`,
`test_codex_hooks.py`, `test_machine_labels.py`, bun `opencode_plugin.test.ts`,
plugins README.

## What was added

- **Backend** (pytest): heartbeat store semantics — never creates, refreshes
  silently, revives stale, cannot unblock/resurrect, real posts still flip
  states — plus the same through the API route.
- **Claude/Codex hooks** (pytest): a mirrored `TestHeartbeat` per script —
  body flag + prompt forwarding, lease claim/spawn-once, alive-skip,
  dead-steal, unsafe session ids, mute, stop (unlink + verified-only kill),
  watcher loop until lease-gone (sleep stub deletes the lease on the third
  cycle), age cap unlink-and-silent, missing lease. Installer/layout tests
  for the rewired `UserPromptSubmit` and legacy replacement.
- **OpenCode** (bun): heartbeat flag recorded on captured posts; five
  ticker tests (pings→idle-stop, blocked-pause→resume, disable, age-out,
  disposal); env knobs cleared in `beforeEach`.
- `test_machine_labels.py`: per-agent split — claude still executes the real
  curl one-liner for `PostToolUse`; codex asserts no curl remains.

## Trials, errors, and lessons

1. **A hung suite is a bisect job.** The first full `pytest tests/notifyhub`
   died at the 300s tool timeout. Running suites separately, then events
   verbosely under `timeout 45`, pinpointed the hanging test in minutes. An
   infinite-loop bug in a sleep-stubbed test hangs *silently* — no output,
   no traceback — so the discipline is: per-directory runs first, `-v` last.
2. **Timing assertions need stable anchors.** `posts.at(-1)` raced the ticker
   when the harness itself slept exactly one interval; asserting on
   `posts[0]` (the deterministic real report) removed the race instead of
   tuning sleeps.
3. **Margins over jitter.** Sub-10ms caps/intervals flake; a 30ms/10ms pair
   with a tolerant ≤1-straggler bound has survived every repeat run since.
4. **Verify pre-existing state before debugging.** Three `test_config.py`
   failures were the dev shell's exported funnel env (`NOTIFYHUB_CLI_SCHEME=
   https`, host, port) leaking into priority tests — reproduced on a stashed
   clean tree before spending time on them. Environmental failures that
   correlate with *your shell*, not your diff.
5. **The smoke tests caught what unit tests cannot**: env-var leakage
   (machine-level `NOTIFYHUB_*` overrides silently redirecting traffic) and
   process-boundary mock limits. Neither is visible to an isolated pytest run.

## Final counts

83 python plugin tests, 172 backend+plugins, 13 bun tests (three consecutive
green runs), typecheck clean. README updated with the new totals and links.
