# Backend: host precedence and host-change broadcast

**Date**: 2026-11-11
**Status**: Done
**Parent**: [`2026-11-11-tui-waiting-card-machine-id.md`](2026-11-11-tui-waiting-card-machine-id.md)

Module: `src/notifyhub/backend/` — `backend.py`, `models.py`; tests in
`tests/notifyhub/backend/test_status.py`.

## Goal

The waiting card showed a Docker bridge address (`172.21.0.1`) instead of the reporting machine
(`kientt44`). The raw Claude/Codex status hooks pipe the upstream hook JSON through unchanged;
that payload has `session_id`/`cwd`/prompt but no `host`, so the endpoint fell back to
`request.client.host`. Behind Docker that is the gateway, not the client machine.

## What changed

### `POST /api/status/<agent>/<state>`

Host resolution is now:

1. `body.host` — opencode plugin and the Python hook scripts send it explicitly.
2. `X-NotifyHub-Host` — the raw `sh`+`curl` one-liners send `$(hostname)` here without rewriting
   the piped JSON.
3. `request.client.host` — last resort for clients that send neither.

The body value is trimmed; an empty/whitespace body value falls through to the header.

### `AgentStatusStore.update`

A host-only change is now part of `changed`:

```python
or (host is not None and existing.host != host)
```

Before this, a corrected machine name updated the stored entry but did not broadcast, so a
connected TUI kept the old IP until the next state/task change or the 5-minute stale revival.

## Design decisions

- **Header instead of rewriting the body.** The hot path is
  `sh -c 'curl --data-binary @-'`; adding `jq`/`sed` would add a dependency or fragile JSON
  surgery. A header is one curl argument and keeps the upstream payload byte-for-byte.
- **Body still wins.** Clients that can send structured data (opencode plugin, Python hooks) keep
  the explicit field; the header is a fallback for thin shell clients.
- **Client IP remains the last resort.** It is better than a null host for a client that predates
  the header, and it matches the previous behaviour.
- **Host changes are visible.** The waiting card is live state; a late-arriving machine name should
  not require a reconnect or a state transition.
- **No auth/trust boundary change.** The backend is already unauthenticated when published through
  a funnel; the host is display metadata. Do not treat it as a security identity.

## Trials, errors and lessons

### The backend was not stamping the hostname; the client never sent it

The first assumption was that the backend ignored `host`. `GET /api/status` showed opencode
entries with `kientt44` and the claude entry with `172.21.0.1`. The difference was the reporter:
opencode sends a JSON body, the Claude/Codex `UserPromptSubmit`/`PostToolUse` hooks pipe raw hook
payloads.

**Lesson**: when two clients of the same endpoint disagree, compare their request shapes before
changing the endpoint.

### The Docker bridge IP looked like a client IP

`172.21.0.1` is a private gateway address. It is what the backend container sees for a request
made from the Docker host, not the machine's LAN address.

**Lesson**: behind a container/proxy, `request.client.host` is the proxy's peer address. Treat it
as "last resort", not as the machine identity.

### A stored change is not a broadcast change

`update()` accepted the new host but `changed` only tracked state, pwd and task. The TUI did not
see the correction until something else moved.

**Lesson**: every field rendered by a live view belongs in the change comparison. Otherwise the
store and the screen disagree even though the API response looks correct.

### The fallback test relied on TestClient's address

The existing test asserted `host == "testclient"`. Adding header precedence without breaking it
required keeping the client-address branch as the final fallback.

**Lesson**: keep the old fallback tested; new precedence should be additive, not a replacement.

## Verification

- `test_host_header_used_before_client_address` — header beats TestClient's address.
- `test_body_host_wins_over_header` — body remains authoritative.
- `test_host_change_reannounces` — host-only transition returns `True`.
- Existing e2e status test still passes (the header is outside the envelope).
- `python -m pytest tests/notifyhub/backend/test_status.py -q`: all pass.

## Docs updated

- `docs/important/agent-status.md` — host-field precedence and Docker/proxy note.
- `docs/important/claude-code-hooks.md`, `codex-hooks.md` — one-liner header and reinstall note.
- Plan index: [`2026-11-11-agent-status-host-header-plugins.md`](2026-11-11-agent-status-host-header-plugins.md).

## Related

- Parent: [`2026-11-11-tui-waiting-card-machine-id.md`](2026-11-11-tui-waiting-card-machine-id.md)
- CLI: [`2026-11-11-agent-status-host-header-cli.md`](2026-11-11-agent-status-host-header-cli.md)
- Plugins: [`2026-11-11-agent-status-host-header-plugins.md`](2026-11-11-agent-status-host-header-plugins.md)
