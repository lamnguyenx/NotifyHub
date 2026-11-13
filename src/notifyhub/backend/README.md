# NotifyHub Backend

FastAPI app serving the notification REST API, the SSE stream and the live agent-status store.
It serves **no HTML or static files** — the TUI is the interactive client. Run it with
`make backend` (port `9080` by default) or `python -m notifyhub.backend.backend`.

## Files

- `backend.py` — app, routes, SSE manager, status endpoints, server entrypoint.
- `models.py` — `NotificationStore` and the RAM-only `AgentStatusStore`.
- Tests: `tests/notifyhub/backend/`.

## Live agent status

`POST /api/status/<agent>/<state>` accepts `running`, `idle` or `blocked`, and a body flag
`"heartbeat": true` marks a plain liveness refresh: it never creates an entry and never
changes a stored state, so periodic reporter pings can't race the lifecycle (a straggler
ping after `idle` is a no-op; `blocked` never flips back without a real report). A heartbeat
on a stale `running` entry revives it like any late refresh.

The machine identity is resolved in this order:

1. `body.host` — opencode plugin / Python hook scripts.
2. `X-NotifyHub-Host` header — the raw Claude `sh`+`curl` one-liner (per-tool refresh).
3. `request.client.host` — fallback (a container/proxy address if neither is sent).

A host-only change re-announces the entry over SSE, so the TUI waiting card updates immediately.
Operator guide: [`docs/important/agent-status.md`](../../../docs/important/agent-status.md)
(its Heartbeats section documents the reporter-side mechanisms: the opencode in-process
ticker and the claude/codex detached watchers).

## Related

- [Heartbeat session record](../../../docs/plans/2026/11/13/2026-11-13-agent-status-heartbeats-backend.md) — flag semantics, 2026-11-13
- [Host-precedence plan](../../../docs/plans/2026/11/11/2026-11-11-agent-status-host-header-backend.md)
- [CLI plan](../../../docs/plans/2026/11/11/2026-11-11-agent-status-host-header-cli.md)
- [Plugin plan](../../../docs/plans/2026/11/11/2026-11-11-agent-status-host-header-plugins.md)
- [Backend configuration](../../../README.md#6-backend-configuration)

## 2026-11-12 session record

- [Module changes, trials, errors, and lessons](../../../docs/plans/2026/11/12/2026-11-12-drop-web-ui-backend.md)
- [Full session and module map](../../../docs/plans/2026/11/12/2026-11-12-drop-web-ui.md)
