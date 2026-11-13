# Coding-agent integrations

| Directory | Integration | Mode |
|---|---|---|
| `opencode/` | OpenCode v2 | resident TypeScript plugin |
| `claude/` | Claude Code | per-event hook script + `settings.json` merge |
| `codex/` | OpenAI Codex | per-event hook script + `hooks.json` merge |

All three push completions through the shared NotifyHub CLI (`notifyhub-push.py`) and report live
session state to `POST /api/status/<agent>/<state>`.

## Heartbeats

Turns can be silently busy for longer than the stale window (one 5-minute tool call), so every
integration refreshes liveness too — opencode via an in-process ticker, claude/codex via
detached `--heartbeat` watcher processes spawned on turn start and stopped by the turn-end hook
(lease files under `/tmp/notifyhub-<agent>-heartbeat/`, orphan-capped at
`NOTIFYHUB_HEARTBEAT_MAX_MINUTES`, default 120; `0` disables). All pings carry
`"heartbeat": true`, which the backend treats as pure liveness — never a state change.
Design and tunables: [agent-status guide](../../../docs/important/agent-status.md#heartbeats).

## Machine identity

- All three integrations match the push CLI: trimmed `HOST_MODEL` (except empty or
  `Unknown`), then exported `HOSTNAME`, then the OS hostname. Python hooks send it in `body.host`;
  the one remaining raw curl hook (claude `PostToolUse` refresh) sends it in `X-NotifyHub-Host`.
  Hook payloads have no machine field; without the header the backend records the request's
  client IP (often a Docker bridge address).

Run `make install-plugin` to install or update all three integrations at once. It copies the
OpenCode plugin and shared push CLI first, then merges Claude and Codex hooks into their settings.
For individual updates, use `make install-plugin-copy`, `make install-plugin-claude`, or
`make install-plugin-codex`.
Claude sessions need a restart; Codex may need the changed hooks re-trusted via `/hooks`.

## Guides

- [OpenCode plugin](../../../docs/important/opencode-plugin.md)
- [Claude Code hooks](../../../docs/important/claude-code-hooks.md)
- [Codex hooks](../../../docs/important/codex-hooks.md)
- [Agent status](../../../docs/important/agent-status.md)

## Related plans

- [Heartbeat parent (2026-11-13)](../../../docs/plans/2026/11/13/2026-11-13-agent-status-heartbeats-plugins.md)
- [Host-header parent](../../../docs/plans/2026/11/11/2026-11-11-agent-status-host-header-plugins.md)
- [Claude host header](../../../docs/plans/2026/11/11/2026-11-11-agent-status-host-header-plugins-claude.md)
- [Codex host header](../../../docs/plans/2026/11/11/2026-11-11-agent-status-host-header-plugins-codex.md)

## 2026-11-12 session record

- [Module changes, trials, errors, and lessons](../../../docs/plans/2026/11/12/2026-11-12-plugin-labels-installation-and-permissions-plugins.md)
- [Full session and module map](../../../docs/plans/2026/11/12/2026-11-12-plugin-labels-installation-and-permissions.md)
- [Installation and rollout](../../../docs/important/plugin-installation.md)
- [Shared machine label contract](../../../docs/important/notification-machine-labels.md)
- [Focused regression checks](../../../docs/important/plugin-integration-testing.md)
- Agent submodules: [Claude](claude/README.md), [Codex](codex/README.md), [OpenCode](opencode/README.md).
