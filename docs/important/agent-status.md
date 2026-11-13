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
  (see [Heartbeats](#heartbeats)): claude/codex spawn a detached watcher on turn start, opencode
  runs an in-process ticker, and claude `PostToolUse` / codex `PostModelRequest` add
  event-driven refreshes. With heartbeats on, `stalled?` reliably means "the agent died", not
  "the turn is silent".
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
| **opencode** (resident plugin — lifecycle authority) | `session.execution.started`, `permission.replied` (+ task excerpt); in-process heartbeat ticker refreshes long turns | `permission.asked` after the one-second grace period and pending check; `form.created` immediately | `session.idle`, `session.execution.succeeded/failed/interrupted` |
| **claude** (hooks) | `UserPromptSubmit` → python hook posts `running` (forwarding the prompt) and spawns the `--heartbeat` watcher; `PostToolUse` → curl one-liner refresh | `Notification` (permission/elicitation/agent_needs_input) | `Stop` / `StopFailure` (also end the watcher) |
| **codex** (hooks) | `UserPromptSubmit` → python hook + `--heartbeat` watcher; `PostModelRequest` event refresh (also re-arms the watcher) | `PermissionRequest` (human-reviewer only), `request_user_input` | `Stop` / `Interrupt` (also end the watcher) |

Common properties:

- **Heartbeats** (see below) are periodic `running` refreshes sent with
  `"heartbeat": true`; they keep a live entry fresh without ever changing state.
- **Thin curl refresh** (claude `PostToolUse` only): inline
  `sh -c 'curl --data-binary @- "$s://$h:$p/api/status/<agent>/running"'` command — the hook
  payload on stdin goes straight to the backend, which extracts `session_id`/`cwd`/the prompt
  itself. Turn start runs the python reporter instead (labels, prompt forwarding, watcher
  spawn); one prompt per turn is a cold path, so the interpreter start is not a hot-path cost.
- **Backend address** comes from `NOTIFYHUB_CLI_HOST` / `_PORT` / `_SCHEME` (same as the push
  CLI), and `${VAR-default}` expansion keeps the documented empty-host **mute** working.
- **Failures are silent by design** — status is best-effort and must never delay or fail a turn.
- Completion notifications from all three reporters now carry `data.session_id`, so consumers
  can resolve a running row exactly when its turn's notification lands.

## Heartbeats

A turn can go longer than the stale window with **no** reporting event — one tool call or
model stream that runs 5+ minutes (the exact case the `stalled?` state was catching as a false
positive). Each reporter now refreshes liveness actively:

- **opencode**: the resident plugin keeps a `running` map and re-posts each entry with
  `heartbeat: true` on a 60s `setInterval`, aging entries out after a cap (default 2h). The
  timer is torn down with the plugin.
- **claude / codex**: hooks only run on events, so turn start (`UserPromptSubmit`) spawns the
  hook script itself in `--heartbeat` mode — a **detached watcher** that re-posts `running`
  every 60s. A per-session lease file (`$NOTIFYHUB_HEARTBEAT_DIR`, default
  `/tmp/notifyhub-<agent>-heartbeat/<sha256(session)>.json`) makes the spawn idempotent; the
  turn's `Stop`/`StopFailure`/`Interrupt` hook removes the lease (and, where `/proc` can prove
  the pid is the watcher, SIGTERMs it), so the watcher exits on its next lease check. Codex
  `PostModelRequest` re-arms a watcher that aged out mid-turn.
- **Orphan guards**: a watcher hard-exits after `NOTIFYHUB_HEARTBEAT_MAX_MINUTES` (default
  **120**; `0` disables) and removes its lease, so a dead agent's card still goes `stale`
  instead of idling "running" forever. Session ids are validated (`^[-_A-Za-z0-9.]+$`) before
  they touch the filesystem.
- **Server-side safety**: heartbeat posts are pure liveness pings. They never create entries
  and never change a stored state — a ping cannot resurrect an idle session or flip a
  permission-`blocked` one back to `running` (real transitions, like claude `PostToolUse`
  after you answer, still flip normally). A heartbeat arriving on an already-`stale` running
  entry revives and re-announces it, like any late refresh.

Tunables (all three reporters, same names):

| Env | Default | Meaning |
|---|---|---|
| `NOTIFYHUB_HEARTBEAT_INTERVAL_SECONDS` | `60` | Refresh cadence (plugin floor 1s, hook scripts 5s) |
| `NOTIFYHUB_HEARTBEAT_MAX_MINUTES` | `120` | Orphan cap — watcher/ticker gives up after this; `0` disables |
| `NOTIFYHUB_HEARTBEAT_DIR` | `/tmp/notifyhub-<agent>-heartbeat` | Lease directory (hook scripts only) |

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
| Entry stuck `stale` | The agent died without an idle event (crash/kill) — with heartbeats on, `stalled?` means exactly this; a fresh prompt clears it. If it happens on every long turn, the watcher never started: check re-trusted `/hooks` definitions and `NOTIFYHUB_HEARTBEAT_MAX_MINUTES`/`_INTERVAL_SECONDS`. |
| Entry shows running long after the agent died | The heartbeat watcher outlived its turn — it should age out within `NOTIFYHUB_HEARTBEAT_MAX_MINUTES` (default 2h). Inspect `/tmp/notifyhub-<agent>-heartbeat/` and `/proc/<pid>/cmdline` if it persists. |
| Status works, notifications don't (or vice versa) | They are independent channels (status posts vs push script) — check `NOTIFYHUB_PUSH_SCRIPT` exists and the backend log. |

## 2026-11-13 records

- [Parent session and module map](../plans/2026/11/13/2026-11-13-agent-status-heartbeats.md) — heartbeats
- [Backend](../plans/2026/11/13/2026-11-13-agent-status-heartbeats-backend.md) — heartbeat flag semantics
- [Plugins parent](../plans/2026/11/13/2026-11-13-agent-status-heartbeats-plugins.md) — mechanism split
- [OpenCode](../plans/2026/11/13/2026-11-13-agent-status-heartbeats-opencode.md) — ticker
- [Claude](../plans/2026/11/13/2026-11-13-agent-status-heartbeats-claude.md) + [hook definitions](../plans/2026/11/13/2026-11-13-agent-status-heartbeats-claude-hooks.md) — watcher + wiring split
- [Codex](../plans/2026/11/13/2026-11-13-agent-status-heartbeats-codex.md) + [hook definitions](../plans/2026/11/13/2026-11-13-agent-status-heartbeats-codex-hooks.md) — watcher + turn-start reporter
- [Tests](../plans/2026/11/13/2026-11-13-agent-status-heartbeats-tests.md) — regression suites

## 2026-11-12 records

- [Parent session and module map](../plans/2026/11/12/2026-11-12-plugin-labels-installation-and-permissions.md)
- [Plugin parent](../plans/2026/11/12/2026-11-12-plugin-labels-installation-and-permissions-plugins.md)
- [CLI contract](../plans/2026/11/12/2026-11-12-plugin-labels-installation-and-permissions-cli.md)
- [Focused tests](plugin-integration-testing.md)
