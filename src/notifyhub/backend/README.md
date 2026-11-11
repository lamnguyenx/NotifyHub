# NotifyHub Backend

FastAPI app serving the notification REST API, the SSE stream and the live agent-status store.
Run it with `make backend` (port `9080` by default) or
`python -m notifyhub.backend.backend`.

## Files

- `backend.py` — app, routes, SSE manager, status endpoints, server entrypoint.
- `models.py` — `NotificationStore` and the RAM-only `AgentStatusStore`.
- Tests: `tests/notifyhub/backend/`.

## Live agent status

`POST /api/status/<agent>/<state>` accepts `running`, `idle` or `blocked`. The machine identity is
resolved in this order:

1. `body.host` — opencode plugin / Python hook scripts.
2. `X-NotifyHub-Host` header — the raw Claude/Codex `sh`+`curl` one-liners.
3. `request.client.host` — fallback (a container/proxy address if neither is sent).

A host-only change re-announces the entry over SSE, so the TUI waiting card updates immediately.
Operator guide: [`docs/important/agent-status.md`](../../../docs/important/agent-status.md).

## Related

- [Host-precedence plan](../../../docs/plans/2026/11/11/2026-11-11-agent-status-host-header-backend.md)
- [CLI plan](../../../docs/plans/2026/11/11/2026-11-11-agent-status-host-header-cli.md)
- [Plugin plan](../../../docs/plans/2026/11/11/2026-11-11-agent-status-host-header-plugins.md)
- [Backend configuration](../../../README.md#11-backend-configuration)
