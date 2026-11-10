# OpenAI Codex Hooks Port

**Date**: 2026-11-09
**Status**: Done (installed, discovered by `hooks/list`, and verified end-to-end with a fake local provider; trust pending in `/hooks`)

## Goal

Give **OpenAI Codex** the same NotifyHub notifications the OpenCode v2 plugin and Claude Code hooks
provide — turn completion with user/assistant excerpts, API errors, permission prompts, and questions —
by porting the hook script to Codex's lifecycle events.

Operator-facing guide: `docs/important/codex-hooks.md`.

## Context: Codex hooks are event-spawn

Codex (0.167 on this machine) has a stable hooks system, enabled by default. Like Claude Code, it
spawns a command per lifecycle event with JSON on stdin; unlike Claude Code, hooks must be reviewed and
trusted through `/hooks` before a non-managed hook runs.

Config sources are `~/.codex/hooks.json` or inline `[hooks]` tables in `~/.codex/config.toml` (both are
merged, with a startup warning). The port uses `hooks.json` because it is merge-friendly JSON and does
not require writing TOML.

### Event mapping

| OpenCode v2 event | Codex hook | Notification |
|---|---|---|
| `session.execution.succeeded` | `Stop` | `[#tag:@USER] …` + `[#tag:@ASSISTANT] …` |
| `session.execution.interrupted` | `Interrupt` | same body, transcript-recovered |
| `session.execution.failed` | `PostModelRequest` (`status: failed`) | `[#codex.error] <error>` |
| `permission.asked` | `PermissionRequest` | `[#codex.permission] <reason or tool>` |
| `form.created` (question tool) | `PreToolUse` matcher `request_user_input` | `[#codex.question] <question>` |

Payload facts the port relies on (from the generated schemas):

- `Stop` has `last_assistant_message`, `stop_hook_active`, `transcript_path`, `cwd`, `session_id`, and
  `turn_id`. The transcript is a JSONL rollout: `response_item/message` entries with
  `internal_chat_message_metadata_passthrough.turn_id` and `content_item_kinds`, plus
  `event_msg/task_complete.last_agent_message` for the final answer.
- `Interrupt` has the same common fields but no message text, so both excerpts come from the transcript.
  Codex caps Interrupt hooks at 3 seconds.
- `PostModelRequest` runs per model request attempt with `status` (`completed`/`failed`/`cancelled`) and
  `error`. It is the only failure signal; dedupe per `(session_id, turn_id)` avoids retry spam.
- `PermissionRequest` has `tool_name` and `tool_input`, with an optional
  `tool_input.description` approval reason. Returning no decision lets the normal prompt continue.
- `PreToolUse` fires for local function tools, including `request_user_input`, whose input is
  `{questions: [{id, header, question, options}]}`. The tool is Plan-mode by default;
  `default_mode_request_user_input` enables it in default mode.

### Output contract

`Stop` and `Interrupt` parse stdout as JSON and treat plain text as invalid, so the hook must write
nothing. The script is strictly side-effect only, exits 0 always, and reports push failures on stderr.

### Why completion hooks are synchronous

`codex exec` exits immediately after a turn and cancels unfinished background hooks. An async `Stop`
hook was cancelled before it could push the notification. `Stop`, `Interrupt`, and `PostModelRequest`
are therefore registered with `async: false` (and a 5s push timeout; Interrupt uses 2.5s);
`PermissionRequest` and the question `PreToolUse` hook stay async because they fire while Codex is
waiting for the user and should not delay the prompt. Verified end-to-end with a fake local Responses API provider: async `Stop`
produced no push; synchronous `Stop` delivered `[#tag:@USER] Say OK\n[#tag:@ASSISTANT] OK`.

## Final State

`src/notifyhub/plugins/codex/`:

- **`notifyhub-codex.py`** — Python stdlib-only hook script. Byte-for-byte port of `truncateText`,
  same booleanify mute table + empty-host/port mute, spawns the shared `notifyhub-push.py` with the
  payload `cwd`. Handles `Stop`, `Interrupt`, `PostModelRequest`, `PermissionRequest`, and
  `PreToolUse(request_user_input)`.
- **`install.py`** — merges hook entries into `~/.codex/hooks.json` (respects `CODEX_HOME`): preserves
  foreign hooks and top-level keys, replaces NotifyHub entries in place (stable trust keys), idempotent,
  `--dry-run`, `--remove` deletes the file when only NotifyHub entries remain, and warns when config.toml
  has inline hooks. Completion/error hooks are synchronous; prompt hooks are async.
- **`hooks/hooks.json` + `.codex-plugin/plugin.json`** — identical hooks in Codex plugin layout
  (`${PLUGIN_ROOT}` paths) for marketplace / desktop plugin distribution.
- **`tests/notifyhub/plugins/test_codex_hooks.py`** — transcript extraction, event bodies, dedupe, and
  installer merge/strip coverage.

Makefile: `install-plugin-codex` / `remove-plugin-codex` (added to `.PHONY`). Root README: "OpenAI Codex
Hooks (Optional)" section. Operator guide: `docs/important/codex-hooks.md`.

Installed state on this machine: `~/.codex/hooks.json` carries the five hook groups pointing at the
repo file. The entries still need to be trusted once through `/hooks` before Codex will run them.

Verification: `codex app-server` `hooks/list` reported all five entries with the expected
async/timeout/matcher values and no warnings or errors. A fake local Responses API provider plus
`--dangerously-bypass-hook-trust` produced a real `PostModelRequest` + `Stop` sequence; the stub push
received `[#tag:@USER] Say OK\n[#tag:@ASSISTANT] OK`. That run also proved async `Stop` hooks are
cancelled by `codex exec`, which is why the installed completion hooks are synchronous. A second
run with a fake HTTP 500 upstream produced exactly one `[#codex.error] …` push across five retry
attempts, confirming the per-turn error dedupe.
