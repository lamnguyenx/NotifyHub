# Agent Status (live task broadcast)

> How NotifyHub learns whether an opencode / claude / codex session is running, blocked, or idle
> — and how to read it. Ported from herdr's agent-state model (`_refs/herdr`), 2026-11-10.

Design + session history: `docs/plans/2026/11/10/2026-11-10-agent-status-live-broadcast.md`
(and the per-module docs beside it). The TUI waiting-card view is documented in
[`2026-11-11-tui-waiting-cards.md`](../plans/2026/11/11/2026-11-11-tui-waiting-cards.md).
The machine-ID/host work is in
[`2026-11-11-tui-waiting-card-machine-id.md`](../plans/2026/11/11/2026-11-11-tui-waiting-card-machine-id.md)
(module plans:
[backend](../plans/2026/11/11/2026-11-11-agent-status-host-header-backend.md),
[CLI](../plans/2026/11/11/2026-11-11-agent-status-host-header-cli.md),
[plugins](../plans/2026/11/11/2026-11-11-agent-status-host-header-plugins.md)).

## What it is

Each coding-agent CLI on a machine reports its session lifecycle to the NotifyHub backend:

```
POST /api/status/<agent>/<state>     state ∈ running | idle | blocked, agent ∈ opencode | claude | codex
GET  /api/status                     → {agents: [{agent, session_id, state, pwd, host, task, since, updated}], server_time}
SSE  agent_status                    → one entry per meaningful change (new session, transition, new task)
```

- **RAM-only**. Nothing is persisted; a backend restart clears it (reporters re-populate on the
  next event of each live session).
- **Task excerpt**: entries carry a ≤160-char one-line excerpt of the running prompt (extracted
  server-side from `UserPromptSubmit` payloads, or posted by the opencode plugin). It stays in
  `GET /api/status` / `agent_status` and is rendered on the TUI waiting card's `@USER` line.
- **Staleness**: a `running` entry whose last refresh is older than
  `backend.agent_status_stale_seconds` (default **300**) is served as `stale` — the stored state
  isn't changed, so a late refresh revives it. Reporters refresh actively during long turns
  (claude `PostToolUse`, codex `PostModelRequest`, opencode events).
- **e2e**: serving/SSE entries are AES-256-GCM envelopes per entry when an e2e key is configured
  (same wrapping as notifications). Ingest accepts plaintext (TLS) or an envelope.
- **Host field**: reporters may send `host` in the JSON body (opencode plugin, Python hook
  scripts) or as an `X-NotifyHub-Host` header (the raw `sh`+`curl` one-liners, which pipe the
  upstream hook payload through unchanged). The backend prefers the body, then the header, then
  the request's client IP. The header matters behind Docker/proxies: without it a raw curl from
  the host can arrive with a bridge address such as `172.21.0.1` instead of the machine name.

## Reporters per agent

| Agent | running | blocked | idle |
|---|---|---|---|
| **opencode** (resident plugin — lifecycle authority) | `session.execution.started`, `permission.replied` (+ task excerpt) | `permission.asked` after the one-second grace period and pending check; `form.created` immediately | `session.idle`, `session.execution.succeeded/failed/interrupted` |
| **claude** (hooks) | `UserPromptSubmit` / `PostToolUse` → curl one-liner | `Notification` (permission/elicitation/agent_needs_input) | `Stop` / `StopFailure` |
| **codex** (hooks) | `UserPromptSubmit` → Unix curl / Windows Python reporter; `PostModelRequest` heartbeat | `PermissionRequest` (human-reviewer only), `request_user_input` | `Stop` / `Interrupt` |

Common properties:

- **Thin curl hooks**: `UserPromptSubmit`/`PostToolUse` are inline
  `sh -c 'curl --data-binary @- "$s://$h:$p/api/status/<agent>/running"'` commands — the hook
  payload on stdin goes straight to the backend, which extracts `session_id`/`cwd`/the prompt
  itself. Unix running hooks avoid interpreter startup; Codex on Windows uses its Python reporter
  and forwards the turn-start prompt.
- **Backend address** comes from `NOTIFYHUB_CLI_HOST` / `_PORT` / `_SCHEME` (same as the push
  CLI), and `${VAR-default}` expansion keeps the documented empty-host **mute** working.
- **Failures are silent by design** — status is best-effort and must never delay or fail a turn.
- Completion notifications from all three reporters now carry `data.session_id`, so consumers
  can resolve a running row exactly when its turn's notification lands.

## Install / upgrade

Run `make install-plugin` to refresh OpenCode, the shared push CLI, and both hook integrations.
Individual targets remain available; see [installation and rollout](plugin-installation.md).
Restart Claude and long-lived OpenCode processes, and review changed Codex hooks through `/hooks`.

All live reporters now match the CLI's display label precedence: trimmed `HOST_MODEL` (except
empty or `Unknown`), exported `HOSTNAME`, then OS hostname. See [machine labels](notification-machine-labels.md).

OpenCode permission alerts and `blocked` status wait one second, cancel on matching replies, and
check the pending API before reporting. Autoaccept is implemented in the TUI after the ask event;
a slow client can still leave a pending request long enough to alert. The plugin retains public
session/context APIs and does not read the database directly. See [OpenCode behavior](opencode-plugin.md).

## Reading it

- **TUI** (`make tui`): sessions in motion render as waiting notification cards above the
  stream — project header, agent and host pills (`⌂ Mac153`, `⌂ wsk`, …), the task excerpt on the
  `@USER` line, and `@ASSISTANT` with a shimmering loading gerund + spinner snapped to the card's
  bottom-right while running, `waiting for you ⚠` (amber) when blocked on permission/input, and
  `stalled? ◼` (red) when past the stale window. Cards vanish when idle or when their
  completion notification arrives. The card's time is `since` (session age), not turn age.
  Design/lessons:
  [`2026-11-11-tui-waiting-cards.md`](../plans/2026/11/11/2026-11-11-tui-waiting-cards.md),
  [`2026-11-11-tui-waiting-card-machine-id.md`](../plans/2026/11/11/2026-11-11-tui-waiting-card-machine-id.md)
  and
  [`2026-11-11-tui-prototype-polish.md`](../plans/2026/11/11/2026-11-11-tui-prototype-polish.md).
- **curl** (entries are e2e envelopes when a key is configured):

```bash
curl -s https://<backend>/api/status | python3 -c "
import sys, json, base64
from notifyhub.crypto import decrypt_payload
key = base64.b64decode('<NOTIFYHUB_E2E_KEY>')
for e in json.load(sys.stdin)['agents']:
    print(decrypt_payload(e, key))"
```

## Troubleshooting

| Symptom | Cause / fix |
|---|---|
| Nothing reports for opencode | The running server predates the plugin change — restart opencode. Check `opencode plugin list` shows `notifyhub` from `~/.config/opencode/plugin/`. |
| claude shows running but never idle from `claude -p` | Old installer state — Stop/StopFailure must be `async: false`; re-run `make install-plugin-claude`. |
| codex status missing | Hooks not trusted yet: `/hooks` in a codex session; or `~/.codex/config.toml` has inline `[hooks]` tables the installer defers to. |
| Entry stuck `stale` | The agent died without an idle event (crash/kill) — expected after 5 min; a fresh prompt clears it. |
| Status works, notifications don't (or vice versa) | They are independent channels (curl vs push script) — check `NOTIFYHUB_PUSH_SCRIPT` exists and the backend log. |

## 2026-11-12 records

- [Parent session and module map](../plans/2026/11/12/2026-11-12-plugin-labels-installation-and-permissions.md)
- [Plugin parent](../plans/2026/11/12/2026-11-12-plugin-labels-installation-and-permissions-plugins.md)
- [CLI contract](../plans/2026/11/12/2026-11-12-plugin-labels-installation-and-permissions-cli.md)
- [Focused tests](plugin-integration-testing.md)
