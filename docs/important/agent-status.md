# Agent Status (live task broadcast)

> How NotifyHub learns whether an opencode / claude / codex session is running, blocked, or idle
> — and how to read it. Ported from herdr's agent-state model (`_refs/herdr`), 2026-11-10.

Design + session history: `docs/plans/2026/11/10/2026-11-10-agent-status-live-broadcast.md`
(and the per-module docs beside it). The TUI waiting-card view is documented in
[`2026-11-11-tui-waiting-cards.md`](../plans/2026/11/11/2026-11-11-tui-waiting-cards.md).

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
- **Host field**: reporters may send `host`; otherwise the backend stamps the client IP.

## Reporters per agent

| Agent | running | blocked | idle |
|---|---|---|---|
| **opencode** (resident plugin — lifecycle authority) | `session.execution.started`, `permission.replied` (+ task excerpt) | `permission.asked`, `form.created` | `session.idle`, `session.execution.succeeded/failed/interrupted` |
| **claude** (hooks) | `UserPromptSubmit` / `PostToolUse` → curl one-liner | `Notification` (permission/elicitation/agent_needs_input) | `Stop` / `StopFailure` |
| **codex** (hooks) | `UserPromptSubmit` → curl one-liner; `PostModelRequest` heartbeat | `PermissionRequest` (human-reviewer only), `request_user_input` | `Stop` / `Interrupt` |

Common properties:

- **Thin curl hooks**: `UserPromptSubmit`/`PostToolUse` are inline
  `sh -c 'curl --data-binary @- "$s://$h:$p/api/status/<agent>/running"'` commands — the hook
  payload on stdin goes straight to the backend, which extracts `session_id`/`cwd`/the prompt
  itself. No interpreter startup on the hot path.
- **Backend address** comes from `NOTIFYHUB_CLI_HOST` / `_PORT` / `_SCHEME` (same as the push
  CLI), and `${VAR-default}` expansion keeps the documented empty-host **mute** working.
- **Failures are silent by design** — status is best-effort and must never delay or fail a turn.
- Completion notifications from all three reporters now carry `data.session_id`, so consumers
  can resolve a running row exactly when its turn's notification lands.

## Install / upgrade

Nothing new to install: the status reporting ships inside the existing integrations — re-run the
installer for claude/codex after upgrading (`make install-plugin-claude`, `make
install-plugin-codex`) and `make install-plugin` for opencode. Claude Code needs a session
restart; **a long-lived opencode server/TUI keeps the previously-loaded plugin instance until it
restarts**. Codex may ask to re-trust the changed `hooks.json` (via `/hooks` in a session).

## Reading it

- **TUI** (`make tui`): sessions in motion render as waiting notification cards above the
  stream — project/agent header, the task excerpt on the `@USER` line, and `@ASSISTANT loading
  <spinner>` while running, `waiting for you ⚠` when blocked, `stalled? ◼` when past the stale
  window. Cards vanish when idle or when their completion notification arrives. The card's time
  is `since` (session age), not turn age. Design/lessons:
  [`2026-11-11-tui-waiting-cards.md`](../plans/2026/11/11/2026-11-11-tui-waiting-cards.md).
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
