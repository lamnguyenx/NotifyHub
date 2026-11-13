# Plugins: heartbeat rollout across the three integrations

**Date**: 2026-11-13
**Status**: Done
**Parent**: [`2026-11-13-agent-status-heartbeats.md`](2026-11-13-agent-status-heartbeats.md)

Module: `src/notifyhub/plugins/` — strategy shared by the opencode, claude and
codex submodules (their records carry the per-module details).

## Module map

| Submodule | Plan |
|---|---|
| `opencode/` | [`2026-11-13-agent-status-heartbeats-opencode.md`](2026-11-13-agent-status-heartbeats-opencode.md) |
| `claude/` | [`2026-11-13-agent-status-heartbeats-claude.md`](2026-11-13-agent-status-heartbeats-claude.md) |
| `claude/hooks/` | [`2026-11-13-agent-status-heartbeats-claude-hooks.md`](2026-11-13-agent-status-heartbeats-claude-hooks.md) |
| `codex/` | [`2026-11-13-agent-status-heartbeats-codex.md`](2026-11-13-agent-status-heartbeats-codex.md) |
| `codex/hooks/` | [`2026-11-13-agent-status-heartbeats-codex-hooks.md`](2026-11-13-agent-status-heartbeats-codex-hooks.md) |

## The split

One problem — silent 5-minute turns flipping live cards to `stalled?` — three
different reporter architectures, so three mechanisms:

| Agent | Why | Mechanism |
|---|---|---|
| opencode | plugin is resident in the agent process | in-process `setInterval` ticker |
| claude | hooks fire per event only; long-tool silence | detached `--heartbeat` watcher on turn start + existing `PostToolUse` curl refresh |
| codex | same, plus `codex exec` exits with the turn | detached watcher on turn start + `PostModelRequest` event refresh (re-arms an aged-out watcher) |

## Shared contracts (decided once, implemented thrice)

- **Lease protocol** (claude/codex): `$NOTIFYHUB_HEARTBEAT_DIR/<sha256(session)[:24]>.json`,
  `O_CREAT|O_EXCL` claim, watcher rewrites `{pid, payload}` each cycle as its
  liveness proof, next starter steals a lease whose pid is dead/stale.
- **Env knobs, same names**: `NOTIFYHUB_HEARTBEAT_INTERVAL_SECONDS` (python 5s
  floor) / `NOTIFYHUB_HEARTBEAT_MAX_MINUTES` (0 disables) / the plugin uses
  `_MS` variants of the interval (`NOTIFYHUB_HEARTBEAT_INTERVAL_MS`).
- **Mute rules apply** — `NOTIFYHUB_CLI_ENABLED=false` or empty host/port
  suppresses both reporting and watcher spawning, identical to notifications.
- **Everything best-effort silent** — a watcher's POST failing changes nothing;
  the next cycle retries on schedule.

## Errors confined per module

The watcher loop's inverted disable condition, the `str`-vs-`Path` test bug and
the smoke-test env leakage are recorded in the parent record; each was caught
by a submodule test (codex/claude unit tests, the live smoke) rather than in
integration.

## Lesson

The claude and codex watcher blocks ended up ~150 near-identical lines each.
Considered extracting a shared module — rejected: hook scripts are deliberately
single-file drops (SSH rollout copies them standalone), and duplicated
identical logic with tests mirroring each other was the smaller liability than
a new import-path dependency in every installed hook. If a third hook-based
agent appears, revisit.
