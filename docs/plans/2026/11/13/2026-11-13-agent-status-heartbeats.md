# Agent-status heartbeats: keeping long turns `running`

**Date**: 2026-11-13
**Status**: Done

## Module map

| Submodule | Plan |
|---|---|
| `src/notifyhub/backend/` | [`2026-11-13-agent-status-heartbeats-backend.md`](2026-11-13-agent-status-heartbeats-backend.md) |
| `src/notifyhub/plugins/` | [`2026-11-13-agent-status-heartbeats-plugins.md`](2026-11-13-agent-status-heartbeats-plugins.md) |
| `src/notifyhub/plugins/opencode/` | [`2026-11-13-agent-status-heartbeats-opencode.md`](2026-11-13-agent-status-heartbeats-opencode.md) |
| `src/notifyhub/plugins/claude/` | [`2026-11-13-agent-status-heartbeats-claude.md`](2026-11-13-agent-status-heartbeats-claude.md) |
| `src/notifyhub/plugins/claude/hooks/` | [`2026-11-13-agent-status-heartbeats-claude-hooks.md`](2026-11-13-agent-status-heartbeats-claude-hooks.md) |
| `src/notifyhub/plugins/codex/` | [`2026-11-13-agent-status-heartbeats-codex.md`](2026-11-13-agent-status-heartbeats-codex.md) |
| `src/notifyhub/plugins/codex/hooks/` | [`2026-11-13-agent-status-heartbeats-codex-hooks.md`](2026-11-13-agent-status-heartbeats-codex-hooks.md) |
| `tests/notifyhub/` | [`2026-11-13-agent-status-heartbeats-tests.md`](2026-11-13-agent-status-heartbeats-tests.md) |

## Problem

A `running` entry that stops refreshing for `backend.agent_status_stale_seconds`
(default 300) is served as `stale`, and the TUI renders it red (`stalled? ◼`).
But a turn can be legitimately silent for five minutes: one long tool call
(claude/codex hooks only fire on events), one long model stream or tool call
(opencode only reports transitions). The card then claimed a live agent had
stalled — a false positive the user learns to ignore, which defeats the stale
detector's real job: catching crashed agents.

Request: make the hooks/agent integrations actively ping the backend so the
"stalled" state only ever means "dead".

## Design

Three constraints shaped the solution:

1. **Hooks are callbacks.** Claude/Codex hook scripts cannot be woken mid-turn
   by anything; the only way to ping on a schedule is a process that outlives
   the hook spawn.
2. **`stale` must still work.** Whatever pings must die with the agent, or a
   crashed session would read `running` forever.
3. **Pings must be stateless.** A ping racing the turn's own `idle`/`blocked`
   report must not resurrect a finished session or un-flip a permission wait.

### Backend: the `heartbeat` flag

`POST /api/status/<agent>/running` with `"heartbeat": true` is a **pure
liveness ping**: it never creates an entry, and on a non-`running` entry it is
a silent no-op. On a `running` entry it refreshes `updated` (reviving and
re-announcing one already past the stale window, like any late refresh).
Real transitions (claude `PostToolUse` after answering a permission,
opencode `permission.replied`) keep flipping states normally.

### opencode plugin: in-process ticker

The resident plugin already knows which sessions it last reported `running`
(`lastPostedState`), so a `setInterval` (60s) re-posts each such session with
`heartbeat: true`. Entries age out after a cap (default 2h) — a session with
no real transitions for hours is dead, and dropping it lets the entry go
stale. `postStatus()` was extracted from `reportStatus()` for reuse; the
ticker is cleared (and the map emptied) on plugin teardown.

### claude/codex hooks: detached `--heartbeat` watcher

`UserPromptSubmit` now runs the Python hook, which posts `running` (forwarding
the prompt — previously only the raw curl payload delivered it for claude) and
spawns **the script itself** in `--heartbeat <lease>` mode:

- detached (`start_new_session` / Windows `DETACHED_PROCESS`), so it survives
  the hook process and `codex exec` exiting;
- loop: sleep 60s → check lease exists → `POST running {heartbeat: true}` →
  rewrite lease (pid + mtime = liveness proof);
- a per-session lease file in `$NOTIFYHUB_HEARTBEAT_DIR`
  (default `/tmp/notifyhub-<agent>-heartbeat/<sha256(session)[:24]>.json`),
  claimed with `O_CREAT|O_EXCL` so repeated turn starts never stack watchers;
- the turn's `Stop`/`StopFailure`/`Interrupt` hook removes the lease **before**
  posting `idle` (the watcher exits at its next lease check; where `/proc` can
  prove the pid is the watcher via cmdline, it is also SIGTERMed — a recycled
  pid is never killed without that proof);
- orphan guards: hard age cap (default 120 min, `0` disables) + 24h lease-file
  pruning + strict session-id validation (`^[-_A-Za-z0-9.]+$`) before any path
  is built;
- claude keeps the raw curl one-liner for `PostToolUse` (hot path, no
  interpreter start, flips `blocked → running` on answered permissions — no
  heartbeat flag, by design);
- codex `PostModelRequest` (already an event refresh) also re-arms a watcher
  that aged out mid-turn.

The stopped-watcher-on-blocked problem is why the backend flag exists: a ping
landing while claude waits on a permission is a server-side no-op, so the
watcher does not need to pause during waits and there is no "who restarts it"
gap.

## Bug fixed along the way

`notifyhub-codex.py` `notification_body()` returned the literal string
`"running"` for `UserPromptSubmit`, so the Windows reporter (the only path
where the py script handled that event) pushed a notification reading
`running`. Now `None` — the event is status-only.

## Changes

- `src/notifyhub/backend/models.py`, `backend.py` — `heartbeat` flag semantics.
- `src/notifyhub/plugins/opencode/notifyhub-plugin.ts` — `postStatus()`
  extraction, running-turn map, ticker with age cap, env knobs
  (`NOTIFYHUB_HEARTBEAT_INTERVAL_MS`, `NOTIFYHUB_HEARTBEAT_MAX_MINUTES`).
- `src/notifyhub/plugins/claude/notifyhub-claude.py` — watcher, prompt
  forwarding, `UserPromptSubmit → running`, stop-on-idle, wiring in
  `install.py` + `hooks/hooks.json` (turn start py, PostToolUse curl).
- `src/notifyhub/plugins/codex/notifyhub-codex.py` — same watcher +
  `PostModelRequest` re-arm + the literal-`running` fix; wiring in
  `install.py` + `hooks/hooks.json` (turn start py on all platforms; the curl
  one-liner stays only as a legacy uninstall matcher).
- Docs: `docs/important/agent-status.md` (reporters table, new Heartbeats
  section, troubleshooting), `claude-code-hooks.md`, `codex-hooks.md`,
  plugin `hooks/` READMEs, top-level `README.md`.

## Verification

- `python3 -m pytest tests/notifyhub -q` — 257 passed; the 3 failures in
  `tests/notifyhub/test_config.py` are pre-existing (this shell exports
  `NOTIFYHUB_CLI_HOST/PORT/SCHEME` funnel values; they fail identically on a
  stashed clean tree).
- `bun test ./tests/notifyhub/plugins/opencode_plugin.test.ts` — 13 passed,
  three consecutive runs (timing-sensitive heartbeat tests stable).
- `npm run typecheck --prefix src/notifyhub/plugins/opencode` — clean.
- **Live smoke** (real detached watcher against a real local HTTP server):
  pings arrive at `/api/status/claude/running` with `heartbeat: true` and the
  prompt, the lease carries the watcher pid, and `stop_heartbeat` unlinks the
  lease, SIGTERMs the verified pid, and no further posts arrive.
- New coverage: store/API heartbeat semantics (no create, no unblock/resurrect,
  stale revive), start/stop/steal lease lifecycle, unsafe session ids,
  watcher loop + age cap, installer/layout wiring, plugin ticker
  (pings, blocked pause, resume, disable, age-out, disposal).

Rolled out: `make install-plugin` run; installed settings verified (one entry
per event, curl turn-start replaced in place). Pending at record time: backend
restart, OpenCode restarts, Codex `/hooks` re-trust — the `UserPromptSubmit`
definition string changed for both hook agents.

## Trials and errors (cross-module)

1. **Inverted disable condition → infinite loop.** The watcher loop was first
   written `while max_age <= 0 or time.time() - started <= max_age:` — with
   `0` meaning "disabled", that looped forever, and the age-cap unit test
   hung the whole pytest run (300s timeout, exit 143). Bisected by running
   suites separately under `timeout`, then `-v` to see the last-started test.
   Correct form: `while max_age > 0 and …`. Lesson: when a sentinel value
   changes loop semantics, test the sentinel path as a *loop* test with a
   sleep stub, and never let a disable flag widen a loop.
2. **`lease_path()` is a `str`, tests treated it as `pathlib.Path`** (`.name`
   → AttributeError). Fixed with `os.path.basename`. Lesson: mirror the
   function's return type explicitly in tests; don't assume path-flavored
   helpers return Path objects.
3. **Bun timing race in the first heartbeat test.** The harness `emit()`
   sleeps 20ms internally; the first 20ms heartbeat tick landed inside it, so
   `posts.at(-1)` was nondeterministically the ping instead of the real
   report. Fixed by asserting on `posts[0]` (deterministically the real
   `running` report). Lesson: in timing tests, assert ordering-stable
   elements (the first), not the last.
4. **Flaky age-cap test.** A 6ms cap against a 20ms interval left margins
   smaller than scheduler jitter. Fixed: 30ms cap / 10ms interval plus a
   tolerant bound (at most one straggler tick). Lesson: timer-test margins
   must exceed timer jitter by an order of magnitude; three consecutive full
   runs are the acceptance bar.
5. **Mocks don't cross process boundaries.** The first smoke monkeypatched
   `urllib` in the parent and expected the spawned watcher child to hit the
   capture — impossible: the patch lives in the parent's memory. Fixed by
   standing up a real `http.server` on a loopback port. Lesson: test real
   child processes with a real server (or an envoy), never in-parent mocks.
6. **Silent failure hid the smoke's real bug — env leakage.** Even the
   in-process direct POST produced zero hits: this dev shell exports
   `NOTIFYHUB_CLI_SCHEME=https` (Tailscale funnel), so posts went to
   `https://127.0.0.1:<port>` against a plain-HTTP server and were swallowed
   by the catch-all, exactly as designed in production. The smoke now pins
   scheme/host/port explicitly. Two lessons: hermetic tests (and smokes) must
   pin *all* endpoint variables, and best-effort-silent reporters are
   debuggable only with direct observation (print at the boundary) when
   something doesn't arrive.
7. **Smoke lease bookkeeping traps (two attempts):** reading the lease before
   the watcher's first rewrite (`pid: 0`), and writing the lease at an
   arbitrary path while `stop_heartbeat` computes the digest path. Both fixed
   by using the module's own `lease_path()` and waiting for a nonzero pid.
   Lesson: when testing file-claim protocols, go through the module's own
   path/claim helpers rather than hand-building state.
8. **`pkill -f` self-match.** The cleanup `pkill -f "notifyhub-claude.py
   --heartbeat /tmp/…"` matched its own `bash -c` command line and SIGTERMed
   the running shell (exit 143, midway through the cleanup chain). Lesson:
   bracket a character in the pattern (`notifyhub-claude[.]py`) so a process
   enumeration never matches the enumerator.
9. **Pre-existing failures misread as regressions.** Three `test_config.py`
   failures appeared in the first full run; `git stash` + rerun on the clean
   tree reproduced them identically (same funnel env leakage, different
   suite). Lesson: baseline the suite on the clean tree before debugging new
   failures in a session that changed a lot.

## Lessons learnt (design level)

- **A liveness channel must be semantically separate from the state channel.**
  Making heartbeats a flag the server interprets ("refresh, never mutate")
  removed an entire family of race conditions client-side: straggler pings
  after idle, pings during permission waits, pings after a backend restart.
  The alternative — clients pausing/precisely sequencing pings — would have
  been fragile forever.
- **Orphan guards belong in three places**: the watcher's own age cap (time),
  lease freshness checks (no liveness proof → steal), and strict input
  validation before any filesystem path is built from an external id.
- **"Who stops it" must be answered at spawn time.** spawn/lifecycle decisions
  that depend on the turn-end hook firing (which crash paths skip) need a
  belt (SIGTERM with `/proc` pid proof) *and* suspenders (age cap).
- **Keep event-driven refreshes where they exist; add polling only to fill
  the gap.** Codex `PostModelRequest` and claude `PostToolUse` already were
  refresh hooks — the watcher only covers the "no events for 5+ minutes"
  hole, and the hot paths (per-tool curl) stayed interpreter-free.

## Limits / future

- Watchers pile one Python process per running codex/claude turn (≤ cap);
  ~10–15 MB RSS each. A shared per-machine daemon would collapse that, at the
  cost of a second coordination protocol — not worth it yet.
- The stop-side SIGTERM is Linux-only (needs `/proc` proof); elsewhere the
  watcher exits at its next tick (≤ interval) — no stray posts either way,
  because pings are server-side no-ops on non-running entries.
- A backend restart loses entries; heartbeats deliberately do not recreate
  them (the next real event does). Pings must never conjure cards.
- Interval is fixed (60s default); no jitter. Fine at this scale — if the
  reporter count ever grows, add ±20% jitter to de-synchronize loads.

Not performed: native Windows execution, live agent runs against a real
backend, and backend/frontend e2e.
