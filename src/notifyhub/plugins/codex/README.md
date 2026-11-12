# OpenAI Codex Plugin (Hooks)

This directory contains NotifyHub's integration for [OpenAI Codex](https://developers.openai.com/codex) —
the counterpart of [`plugins/opencode/notifyhub-plugin.ts`](../opencode/notifyhub-plugin.ts) and
[`plugins/claude/notifyhub-claude.py`](../claude/notifyhub-claude.py).

Codex has no resident in-process plugin event stream like OpenCode v2. It spawns **hook scripts** per
lifecycle event, passing the event as JSON on stdin. So this port is:

- `notifyhub-codex.py` — the hook script Codex spawns per event (side-effect only, always exits 0)
- `hooks/hooks.json` + `.codex-plugin/plugin.json` — the same hooks in Codex **plugin** layout
  (`${PLUGIN_ROOT}` paths) for marketplace / desktop plugin distribution
- `install.py` — merges the hooks into `~/.codex/hooks.json` (merge-preserving, idempotent, `--remove` to undo)

## Event mapping

| Codex hook | OpenCode v2 event | Notification |
|---|---|---|
| `Stop` | `session.execution.succeeded` | `[#tag:@USER] …` + `[#tag:@ASSISTANT] …` message excerpts |
| `Interrupt` | `session.execution.interrupted` | same body, recovered from the transcript |
| `PostModelRequest` (`status: failed`) | `session.execution.failed` | `[#codex.error] <error message>` |
| `PermissionRequest` (human reviewer) | `permission.asked` | `[#codex.permission] <approval reason or tool name>` |
| `PreToolUse` (`request_user_input`) | `form.created` (the question tool) | `[#codex.question] <question>` |

## Status mapping

The hooks also report live session state to `POST /api/status/codex/<state>`:

| Codex hook | Status |
|---|---|
| `UserPromptSubmit` (curl hook) | `running` |
| `PostModelRequest` (any status, per attempt) | `running` — a heartbeat that revives stale entries |
| `PermissionRequest` | `blocked` for human reviewers, `running` when `auto_review` handles it |
| `PreToolUse` (`request_user_input`) | `blocked` |
| `Stop` / `Interrupt` | `idle` (a `stop_hook_active` stop leaves state untouched) |

`UserPromptSubmit` is an inline `sh -c 'curl --data-binary @-'` command piping the
hook payload straight to the server (which extracts `session_id`/`cwd` and the task
excerpt from the prompt), resolved via `NOTIFYHUB_CLI_HOST`/`_PORT`/`_SCHEME` like
the push CLI; the other states are posted by `notifyhub-codex.py` in-process
(`urllib`, proxy-free, 2s timeout). Both reporters use the push CLI label precedence:
trimmed `HOST_MODEL` (except empty or `Unknown`), exported `HOSTNAME`, then the OS hostname.
The raw Unix hook sends it in `X-NotifyHub-Host`; Windows uses the Python reporter, including
the turn-start prompt. The piped payload has no machine field, so without the header the
backend records the request's client IP, often a Docker bridge address. Re-run
`make install-plugin-codex` after upgrading and re-trust the changed entries via `/hooks`.
Completion pushes stamp `NOTIFYHUB_SESSION_ID` so notifications correlate with their status
entry, and `hooks/hooks.json` (plugin layout) carries the same six events.

Notes on fidelity to the OpenCode plugin:

- **Turn body**: `Stop` carries `last_assistant_message`; the user prompt is recovered from the rollout
  transcript (`transcript_path`), skipping AGENTS.md instructions, environment context, permission
  reminders, and other harness-owned messages. `Interrupt` has no message field, so both sides come from
  the transcript. Truncation is a byte-for-byte port of `truncateText` (last 5 lines / 200 chars,
  word-boundary snap, `[#truncated:...]` markers).
- **`stop_hook_active`**: a `Stop` caused by another Stop hook continuing the turn is skipped, so
  hook-driven continuations don't re-notify.
- **Permission notifications only for human reviewers**: Codex runs `PermissionRequest` before the
  reviewer, so the hook reads the turn's `turn_context` from the rollout transcript and stays silent
  when `approvals_reviewer` is `auto_review` or the policy is Full Access/Never. Those approvals are
  handled by the guardian and never reach the user.
- **Sync vs async**: `codex exec` exits immediately after a turn and cancels unfinished background
  hooks, so `Stop`, `Interrupt`, and `PostModelRequest` are registered **synchronously** (10s / 3s
  handler timeouts, 5s / 2.5s push timeouts). `PermissionRequest` and the question hook stay async so
  they never delay an approval prompt.
- **Dedupe**: completion and error notifications are claimed once per `(session_id, turn_id)`. Codex
  emits `PostModelRequest` per model request attempt (retries included), so this prevents a retry storm
  from producing a notification per attempt.
- **`pwd`**: the push script is spawned with the payload's `cwd` (the session directory, worktree-aware).
- **Questions**: Codex asks through the experimental `request_user_input` tool. It is available in Plan
  mode by default; the `default_mode_request_user_input` feature enables it in default mode too. Older
  Codex versions without the tool fall back to a plain assistant message + `Stop` (already covered).
- **No muted-agent config**: Codex hooks run in the session's own process, so the OpenCode plugin's
  multi-instance dedupe/mute problem does not exist here.

## Installation

```bash
make install-plugin                  # installs OpenCode, Claude, and Codex together

# To update only this integration (shared push CLI already installed):
make install-plugin-codex

# In a Codex session, open /hooks and trust the NotifyHub entries
make remove-plugin-codex             # uninstall
```

Codex **requires non-managed hooks to be reviewed and trusted** before they run. `/hooks` shows the
pending entries; trust them once. Codex records trust against the hook definition/hash, so editing
`notifyhub-codex.py` does not require re-trusting unless the installed hook definition changes.
Re-running the installer replaces NotifyHub's entries **in place**, so existing trust keys do not move.

The installer respects `CODEX_HOME` (default `~/.codex`) and uses `~/.codex/hooks.json` rather than
editing `config.toml`. If `config.toml` already has inline `[hooks]` tables, Codex merges both sources
and warns at startup; the installer prints a note instead of rewriting your TOML.

## Configuration

Same environment variables as the OpenCode and Claude Code integrations, read by the hook script:

| Variable | Default | Purpose |
| --- | --- | --- |
| `NOTIFYHUB_CLI_HOST` | `0.0.0.0` | NotifyHub host |
| `NOTIFYHUB_CLI_PORT` | `9080` | NotifyHub port |
| `NOTIFYHUB_PUSH_SCRIPT` | `~/.config/opencode/plugin/notifyhub-push.py` | Override the CLI path (shared with the OpenCode install) |
| `NOTIFYHUB_CLI_ENABLED` | unset | `false`-like value mutes, without spawning the CLI |
| `NOTIFYHUB_CODEX_STATE_DIR` | system temp dir | Dedupe claim files (tests / custom cleanup) |

Exporting `NOTIFYHUB_CLI_HOST` or `NOTIFYHUB_CLI_PORT` as an empty string mutes too. Hooks inherit the
**Codex process environment**, so set the variables before launching `codex` (or bake them into the hook
command in `hooks.json`).

## Testing

```bash
cd src/notifyhub/plugins/codex
python3 -m py_compile notifyhub-codex.py install.py

cat > /tmp/stub-push.py <<'EOF'
import json, os, sys
print(json.dumps({"argv": sys.argv[1:], "cwd": os.getcwd()}))
EOF

echo '{"hook_event_name":"Stop","stop_hook_active":false,"turn_id":"t1",
       "last_assistant_message":"done","cwd":"/tmp","transcript_path":"/nonexistent"}' \
  | NOTIFYHUB_PUSH_SCRIPT=/tmp/stub-push.py python3 notifyhub-codex.py
```

Useful cases: `stop_hook_active: true` (silent), `Interrupt` with a synthetic rollout transcript,
`PermissionRequest` with `tool_input.description`, `PreToolUse` with `tool_name: "request_user_input"`,
`PostModelRequest` with `status: "failed"`, and `NOTIFYHUB_CLI_ENABLED=false` (silent). The pytest suite
is at `tests/notifyhub/plugins/test_codex_hooks.py`.

Manual verification against a running server: `make backend`, then run a Codex turn and watch
`http://localhost:9080` — same payload shape (`{pwd, message}`) as the OpenCode plugin.

## Troubleshooting

- Hooks must be trusted in `/hooks`; until then Codex skips them and prints a startup warning.
- Hook stderr goes to the Codex log; `codex` runs hooks with the session `cwd`.
- The script never writes stdout and always exits 0, so it can never block or alter a turn.
- `PostModelRequest` fires per failed attempt. The script dedupes per turn, but a transient failure that
  succeeds on retry still produces an error notification for that turn.

## Related

- [NotifyHub](../../../..) — the notification server (repo root)
- [Codex hooks guide](../../../../docs/important/codex-hooks.md) — install, config, gotchas
- [Port plan](../../../../docs/plans/2026/11/09/2026-11-09-codex-hooks-port.md) — design notes
- [Host-header plan](../../../../docs/plans/2026/11/11/2026-11-11-agent-status-host-header-plugins-codex.md)
  — raw status hook machine name, 2026-11-11
- [OpenCode plugin](../opencode) — the v2 plugin this port mirrors
- [Claude Code hooks](../claude) — the sibling hook-based port
- [Codex hooks reference](https://learn.chatgpt.com/docs/hooks)

## 2026-11-12 session record

- [Module changes, trials, errors, and lessons](../../../../docs/plans/2026/11/12/2026-11-12-plugin-labels-installation-and-permissions-codex.md)
- [Full session and module map](../../../../docs/plans/2026/11/12/2026-11-12-plugin-labels-installation-and-permissions.md)
- [Installation and rollout](../../../../docs/important/plugin-installation.md)
- [Shared machine label contract](../../../../docs/important/notification-machine-labels.md)
- [Focused regression checks](../../../../docs/important/plugin-integration-testing.md)
- [Hook-definition submodule](hooks/README.md) and its [session record](../../../../docs/plans/2026/11/12/2026-11-12-plugin-labels-installation-and-permissions-codex-hooks.md)
