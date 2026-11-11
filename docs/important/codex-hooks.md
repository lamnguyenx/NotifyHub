# OpenAI Codex Hooks

> How NotifyHub integrates with OpenAI Codex — install, behavior, configuration, and the development loop.

Codex has a lifecycle **hooks** system: it spawns a command per event, passing the event as JSON on
stdin. NotifyHub's integration is a single Python hook script —
`src/notifyhub/plugins/codex/notifyhub-codex.py` — registered for five event groups, which spawns the
**same** `notifyhub-push.py` (the NotifyHub CLI) the OpenCode and Claude Code integrations use.

Design notes and the payload-schema research:
`docs/plans/2026/11/09/2026-11-09-codex-hooks-port.md`. The 2026-11-11 host-header fix is in
[`2026-11-11-agent-status-host-header-plugins-codex.md`](../plans/2026/11/11/2026-11-11-agent-status-host-header-plugins-codex.md).

## Requirements

- Codex with lifecycle hooks (`/hooks` works in a session; hooks are stable and enabled by default)
- `notifyhub-push.py` on disk — installed once via the OpenCode target: `make install-plugin`
  (shared by all three integrations; Codex needs it but has no separate copy)
- NotifyHub server reachable per your `~/.config/notifyhub` config

## Install & verify

```bash
make install-plugin          # once, if not already done: installs the shared notifyhub-push.py
make install-plugin-codex    # merges the NotifyHub hooks into ~/.codex/hooks.json
make backend                 # start the local server, if yours runs locally
```

Then open **`/hooks`** in a Codex session and trust the NotifyHub entries. Codex requires non-managed
hooks to be reviewed and trusted before they run; until then it prints a startup warning and skips them.
Codex records trust against the hook definition/hash, so editing the script does not require re-trusting
unless the definition itself changes. The installer replaces NotifyHub's entries **in place**, so
re-running it does not move their trust keys.

- The installer is merge-preserving and idempotent: it keeps every other hooks.json key and foreign
  hook, and re-running it replaces only NotifyHub's own entries.
- `--dry-run` prints the would-be result; `make remove-plugin-codex` (or `python3
  src/notifyhub/plugins/codex/install.py --remove`) strips exactly the NotifyHub entries.
- Hooks run **from the repo file** (`src/notifyhub/plugins/codex/notifyhub-codex.py`), so edits to that
  file take effect on the next event with no reinstall.
- The installer respects `CODEX_HOME` (default `~/.codex`) and uses `hooks.json`, not `config.toml`.
  If `config.toml` already has inline `[hooks]` tables, Codex merges both sources and warns at startup;
  the installer prints a note rather than rewriting your TOML.
- One-off automation that vets hook sources itself can pass `--dangerously-bypass-hook-trust` to Codex.

### Alternative: plugin layout

The directory is also a valid Codex plugin (`.codex-plugin/plugin.json` + `hooks/hooks.json`), with
`${PLUGIN_ROOT}` paths and the same script. It can be published through a local marketplace or installed
as a desktop plugin; plugin-bundled hooks use the same trust review flow. Most single-machine setups
should use the `hooks.json` installer instead.

## Behavior

| Codex hook | OpenCode equivalent | Notification sent to NotifyHub |
|---|---|---|
| `Stop` | `session.execution.succeeded` | `[#tag:@USER] …` + `[#tag:@ASSISTANT] …` (last user + assistant message) |
| `Interrupt` | `session.execution.interrupted` | same body, recovered from the transcript |
| `PostModelRequest` (`status: failed`) | `session.execution.failed` | `[#codex.error] <error message>` |
| `PermissionRequest` (human reviewer) | `permission.asked` | `[#codex.permission] <approval reason or tool name>` |
| `PreToolUse` (`request_user_input`) | `form.created` (question tool) | `[#codex.question] <question>` |

Details:

- **Turn body**: `Stop` carries `last_assistant_message`. The user excerpt is recovered from the rollout
  transcript (`transcript_path`), filtered by the event's `turn_id` and skipping harness-owned messages
  (AGENTS.md instructions, environment context, permission reminders, multi-agent instructions). The
  final assistant message is mirrored in `event_msg/task_complete`; it is the fallback when
  `last_assistant_message` is null. Truncation matches the OpenCode plugin exactly: **last 5 lines / 200
  chars**, snapping to the nearest space/newline in an 8-char window, prefixing
  `[#truncated:+N LINES]` / `[#truncated:+N CHARS]`.
- **`Interrupt`**: a distinct Codex event with no message fields, so both excerpts come from the
  transcript. Notifications are claimed once per `(session_id, turn_id)`, so an interrupt racing a
  `Stop` produces one notification. Codex caps Interrupt hooks at **3 seconds**; the script uses a
  shorter push timeout so the child process is cleaned up.
- **`PostModelRequest`**: Codex runs this for every model request **attempt**, including retries. Only
  `status: "failed"` notifies; `completed` and `cancelled` are ignored. Error notifications are claimed
  once per turn so a retry storm does not produce a notification per attempt. The notification carries
  the first failed attempt's error. A transient failure that succeeds on retry still shows one error
  notification for that turn.
- **`PermissionRequest`**: the notification uses `tool_input.description` when Codex provides an
  approval reason, otherwise `Codex needs your permission to use <tool_name>`. The hook returns no
  decision, so Codex's normal approval prompt continues. It runs async, so the prompt is not delayed.
  Codex fires this event **before** the reviewer runs, so the script skips it when the turn will not
  stop for a person: `permission_mode: "bypassPermissions"` (Full Access / `approval_policy: "never"`)
  or `approvals_reviewer: "auto_review"` (the guardian reviews the request instead). The reviewer is
  read from the turn's `turn_context` entry in the rollout transcript, because the hook payload does
  not carry it. When the transcript or `turn_context` is missing, the notification is kept.
- **`PreToolUse` (`request_user_input`)**: Codex's question tool. The hook extracts the question text
  (and any additional questions) and notifies. The tool is available in Plan mode by default; the
  `default_mode_request_user_input` feature enables it in default mode too. Older Codex versions without
  the tool ask as a plain assistant message followed by `Stop`, which is already covered.
- **Sync vs async**: `codex exec` exits immediately after a turn and cancels unfinished background
  hooks, so `Stop`, `Interrupt`, and `PostModelRequest` are registered **synchronously** (10s / 3s
  handler timeouts, 5s / 2.5s push timeouts). `PermissionRequest` and the question hook stay async so
  they never delay an approval prompt. Verified end-to-end with a fake local provider: async `Stop`
  hooks were cancelled before the push, synchronous hooks delivered.
- **`pwd`**: the hook spawns the push script with the event's `cwd`, so notifications report the real
  working directory (worktree-aware). It falls back to the hook process cwd if the field is missing.
- **Side-effect only**: the script never writes stdout and always exits 0, so it can never block or
  alter a turn. This matters because Codex parses stdout as hook output for `Stop`/`Interrupt` and
  treats plain text as invalid. Push failures are reported on stderr, which lands in the Codex log.

## Agent status reporting

The hooks also report live session state to `POST /api/status/codex/<state>` (see
[`agent-status.md`](agent-status.md)). The raw curl one-liner sends
`X-NotifyHub-Host: $(hostname)` (Windows: `%COMPUTERNAME%`) so the backend records the machine
name rather than the request's client IP, which can be a Docker bridge address:

| Codex hook | Status | How |
|---|---|---|
| `UserPromptSubmit` | `running` | inline `sh -c 'curl --data-binary @- …'` hook (async, 3s) — the raw payload goes straight to the backend, which extracts `session_id`/`cwd`/the task excerpt |
| `PostModelRequest` (every attempt) | `running` | posted in-process by `notifyhub-codex.py` — a heartbeat that also revives entries the backend marked stale |
| `PermissionRequest` | `blocked` when a human must decide, else `running` | posted by `notifyhub-codex.py`, reusing the `needs_human_permission()` check (`auto_review` approvals are not user-visible blockers) |
| `PreToolUse` (`request_user_input`) | `blocked` | posted by `notifyhub-codex.py` |
| `Stop` / `Interrupt` | `idle` | posted by `notifyhub-codex.py` |

Completion pushes stamp `NOTIFYHUB_SESSION_ID` (→ `data.session_id` on the notification) so the
TUI waiting card resolves when the notification lands
([waiting cards plan](../plans/2026/11/11/2026-11-11-tui-waiting-cards.md)).

## Configuration

Hooks inherit the **Codex process environment**, so set variables before launching `codex`:

| Variable | Default | Purpose |
|---|---|---|
| `NOTIFYHUB_CLI_HOST` | `0.0.0.0` | NotifyHub host |
| `NOTIFYHUB_CLI_PORT` | `9080` | NotifyHub port |
| `NOTIFYHUB_CLI_ENABLED` | `true` | `false`/`0`/`off`/`no`/… skips the push-script spawn |
| `NOTIFYHUB_PUSH_SCRIPT` | `~/.config/opencode/plugin/notifyhub-push.py` | Override the CLI path (shared with the OpenCode install) |
| `NOTIFYHUB_CODEX_STATE_DIR` | system temp dir | Dedupe claim files (tests / custom cleanup) |

Muting follows the same rules as the OpenCode plugin: [booleanify](https://github.com/lamnguyenx/booleanify)
truth tables for `NOTIFYHUB_CLI_ENABLED`, and exporting `NOTIFYHUB_CLI_HOST`/`NOTIFYHUB_CLI_PORT` as
empty strings mutes too. Values are evaluated **per event**, but since each spawn inherits Codex's
environment, a change requires launching `codex` with the variable set (or baking it into the hook
`command` in `hooks.json`).

There is no muted-agents equivalent: Codex hooks run in the session's own process, so the OpenCode
plugin's "benchmark `empty` agent on a shared server" dedupe problem does not exist here.

## Development loop

```bash
cd src/notifyhub/plugins/codex
python3 -m py_compile notifyhub-codex.py install.py   # syntax check (stdlib only, no deps)
python3 -m pytest ../../../../tests/notifyhub/plugins/test_codex_hooks.py -v

# Edit notifyhub-codex.py — hooks spawn a fresh process per event, so the next event uses the edit
```

### Testing without touching the live config

Feed synthetic hook payloads straight into the script with a stub push script:

```bash
cat > /tmp/stub-push.py <<'EOF'
import json, os, sys
print(json.dumps({"argv": sys.argv[1:], "cwd": os.getcwd()}))
EOF

echo '{"hook_event_name":"Stop","stop_hook_active":false,"turn_id":"t1",
       "last_assistant_message":"done","cwd":"/tmp","transcript_path":"/nonexistent"}' \
  | NOTIFYHUB_PUSH_SCRIPT=/tmp/stub-push.py python3 notifyhub-codex.py
```

Useful cases: `stop_hook_active: true` (silent), `Interrupt` with a synthetic rollout transcript,
`PermissionRequest` with `tool_input.description` (and a `turn_context` line saying
`approvals_reviewer: "auto_review"` for the silent path), `PreToolUse` with
`tool_name: "request_user_input"`, `PostModelRequest` with `status: "failed"`, and
`NOTIFYHUB_CLI_ENABLED=false` (silent). For the installer, point `CODEX_HOME` at a temporary directory
or use `--dry-run`.

A synthetic transcript line looks like:

```json
{"type":"response_item","payload":{"type":"message","role":"user",
 "content":[{"type":"input_text","text":"fix the bug"}],
 "internal_chat_message_metadata_passthrough":{"turn_id":"t1","content_item_kinds":["user.text"]}}}
```

## Gotchas

| Symptom | Cause / fix |
|---|---|
| Nothing fires at all | Hooks are untrusted — open `/hooks` and trust the NotifyHub entries. Also check `[features] hooks = false` in `config.toml` |
| Hooks missing from `/hooks` | `~/.codex/hooks.json` failed to parse, or `CODEX_HOME` points elsewhere — check the path the installer printed |
| Codex warns about hooks at startup | `config.toml` also has inline `[hooks]`; Codex merges both. Move them into `hooks.json` if the warning is noisy |
| Error notification on a turn that later succeeds | `PostModelRequest` fires per failed attempt; the retry succeeded. One notification per turn is deliberate |
| No `[#codex.permission]` notification despite an approval prompt | The turn is `approvals_reviewer: "auto_review"` or Full Access, so Codex did not stop for a person. Set `approvals_reviewer = "user"` to get permission notifications |
| `[#codex.permission]` fires for approvals you never saw | The turn context could not be read (missing/partial transcript), so the hook cannot tell it was auto-reviewed; check that Codex writes `turn_context` entries to the rollout |
| No notification on an interrupt | Codex caps Interrupt hooks at 3 s; make sure the NotifyHub server is reachable and local |
| Notifications work in the TUI but not `codex exec` | Completion/error hooks must be synchronous — `codex exec` cancels unfinished background hooks when it exits. The installer registers them with `async: false` |
| No question notification | `request_user_input` is unavailable outside Plan mode unless `default_mode_request_user_input` is enabled; older Codex asks in plain text |
| Duplicate completion after a retry | The dedupe claim file was lost (temp dir cleaned) or `session_id`/`turn_id` was empty; safe to ignore |
| Notification says `~` or the launch dir | The event's `cwd` was missing/falsy — the script falls back to its own cwd |
| User/interrupt excerpt is empty | Codex calls the transcript format unstable; Stop still uses `last_assistant_message`, and the notification falls back to a generic completion body |
| Nothing after restart with mute vars | Hooks inherit Codex's environment — `export` the vars **before** launching `codex` |
| Push errors invisible | Check the Codex log; hook stderr lands there. The script never writes stdout |
| `[hooks.state]` remains in `config.toml` after uninstall | Harmless trust bookkeeping for removed entries; Codex ignores state keys with no matching hook |

## Differences that matter vs the Claude Code port

- Codex hooks must be **trusted via `/hooks`**; Claude Code hooks do not have this review gate.
- Codex has a distinct `Interrupt` event, while Claude Code folds interruption into `Stop`.
- Codex has no dedicated `StopFailure`; errors come from `PostModelRequest` (`status: failed`) and are
  deduped per turn.
- Codex questions are detected through the `request_user_input` tool's `PreToolUse` event; Claude Code
  exposes question notifications directly.
- Notification prefixes are `[#codex.*]` (vs `[#claude-code.*]`, `[#opencode.*]`) so the dashboards can
  tell them apart.
