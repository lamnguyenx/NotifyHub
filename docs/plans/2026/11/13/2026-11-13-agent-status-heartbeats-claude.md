# Claude Code hooks: turn-start python reporter + detached heartbeat watcher

**Date**: 2026-11-13
**Status**: Done
**Parent**: [`2026-11-13-agent-status-heartbeats.md`](2026-11-13-agent-status-heartbeats.md)

Module: `src/notifyhub/plugins/claude/` (`notifyhub-claude.py`, `install.py`);
hook definitions in [`2026-11-13-agent-status-heartbeats-claude-hooks.md`](2026-11-13-agent-status-heartbeats-claude-hooks.md).

## What changed

`notifyhub-claude.py` gained the watcher section (~150 lines):

- **`main(--heartbeat <lease>)`** — the script re-executes itself detached
  (`start_new_session`, stdio `/dev/null`) as the watcher; on POSIX it is
  reparented to init immediately, so no signal group or terminal teardown
  touches it, and `claude -p` exiting after a turn cannot cancel it.
- **`start_heartbeat`** on `UserPromptSubmit`: makedirs + prune stale leases
  (24h TTL), steal-or-skip when a verified watcher holds a fresh lease
  (`_watcher_alive`: signal-0 probe *and* `/proc/<pid>/cmdline` must reference
  `--heartbeat` + the lease path, so recycled pids are neither trusted nor
  killed), else claim with `O_CREAT|O_EXCL` and spawn.
- **`run_heartbeat`**: sleep(interval, 5s floor) → lease exists? → POST
  `running {heartbeat:true}` → rewrite lease with own pid. Exits when the
  lease disappears or the age cap hits (then unlinks, so no dead watcher
  leaves a claim behind).
- **`stop_heartbeat`** on `Stop`/`StopFailure` — runs *before* the idle post:
  unlink lease, then SIGTERM the pid only when `_watcher_alive` proved it.
  Ordering matters: a lease-gated ping can never land after `idle`.
- `status_event` maps `UserPromptSubmit` → `running`; `post_status` forwards
  the **prompt in the body** for the waiting card's `@USER` excerpt and
  carries the heartbeat flag — so claude turn-start reporting no longer
  depends on the raw-payload server-side extraction, and works identically on
  Windows (where the curl one-liner never ran).

Installer/wiring (`install.py`, `hooks/hooks.json`): `UserPromptSubmit` moved
from the curl one-liner to the py script (async, 10s); `PostToolUse` stayed
curl — see the hooks submodule record for why.

## Trial and error

- The watcher loop first shipped with `while max_age <= 0 or …` — inverted:
  "0 disables" became "0 loops forever". The age-cap unit test hung the entire
  pytest session (300s timeout); found by bisecting suites under `timeout`
  and reading the last-started test in `-v` output. Fixed to `while
  max_age > 0 and …`.
- Unit-test trap: `lease_path()` returns `str`; tests that assumed `pathlib`
  (`.name`) failed with AttributeError before asserting anything. Use
  `os.path.basename` (or `tmp_path / lease_path(...)` consciously).

## Verification

`TestHeartbeat` in `tests/notifyhub/plugins/test_claude_hooks.py`: heartbeat
body flag + prompt forwarding; claim-and-spawn-once; skip when watcher alive;
steal when dead; unsafe session ids rejected (no file written); mute respected;
stop unlinks + terminates a *verified* pid (and never an unverified one);
watcher loop posts until lease disappears; age cap exits silently. Plus
installer/layout tests asserting the new split wiring and that the old curl
entry is replaced in place. Live smoke against a real HTTP server recorded in
the parent plan.
