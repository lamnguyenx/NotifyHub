# Claude Code Plugin (Hooks)

This directory contains NotifyHub's integration for [Claude Code](https://claude.com/product/claude-code) —
the counterpart of [`plugins/opencode/notifyhub-plugin.ts`](../opencode/notifyhub-plugin.ts).

Claude Code has no in-process event-stream plugin API like OpenCode v2's `ctx.event.subscribe`.
Instead it spawns **hook scripts** per lifecycle event, passing the event as JSON on stdin.
So where the OpenCode plugin is one resident TypeScript file, this port is:

- `notifyhub-claude.py` — the hook script Claude Code spawns per event (side-effect only, always exits 0)
- `hooks/hooks.json` + `.claude-plugin/plugin.json` — the same hooks in Claude Code **plugin** layout,
  for marketplace / `--plugin-dir` distribution
- `install.py` — merges the hooks into `~/.claude/settings.json` (merge-preserving, idempotent, `--remove` to undo)

## Event mapping

| Claude Code hook | OpenCode v2 event | Notification |
| --- | --- | --- |
| `Stop` | `session.execution.succeeded` / `interrupted` | `[#tag:@USER] …` + `[#tag:@ASSISTANT] …` message excerpts |
| `StopFailure` | `session.execution.failed` | `[#claude-code.error] <error message>` |
| `Notification` (`permission_prompt`) | `permission.asked` | `[#claude-code.permission] <message>` |
| `Notification` (`elicitation_dialog`, `elicitation_url_dialog`, `agent_needs_input`) | `form.created` (the `question` tool) | `[#claude-code.question] <message>` |

Notes on fidelity to the OpenCode plugin:

- **Turn body**: `Stop` carries `last_assistant_message` directly; the user prompt is recovered from the
  session transcript (`transcript_path`), skipping meta entries, sidechain/subagent turns, and
  tool-result-only messages. Truncation is a byte-for-byte port of `truncateText` (last 5 lines /
  200 chars, word-boundary snap, `[#truncated:...]` markers).
- **`stop_hook_active`**: a `Stop` caused by another Stop hook continuing the turn is skipped,
  so hook-driven continuations don't re-notify.
- **`pwd`**: the push script is spawned with the payload's `cwd` (the session directory, worktree-aware),
  not the launch directory — mirroring the OpenCode plugin's session-directory resolution.
- **No multi-instance dedupe needed**: Claude Code runs hooks in the session's own process.
- **Not wired by default**: `idle_prompt` (Stop already notified for that turn), quota/auth/plugin
  notification types, and `PermissionRequest`. `permission_prompt` itself is gated ~6 s by Claude Code
  ("appear away from terminal"); for an immediate ping on every permission request, add a
  `PermissionRequest` hook — `notifyhub-claude.py` already handles that event.

## Installation

```bash
# 1. The push script is shared with the OpenCode plugin target
make install-plugin                  # copies notifyhub-push.py to ~/.config/opencode/plugin/

# 2. Wire the hooks into ~/.claude/settings.json
make install-plugin-claude           # or: python3 src/notifyhub/plugins/claude/install.py

# restart Claude Code sessions, then verify: /hooks → user settings → Stop / StopFailure / Notification
make remove-plugin-claude            # uninstall
```

Alternative (no settings edit): load this directory as a plugin —

```bash
claude --plugin-dir src/notifyhub/plugins/claude
```

or publish it via a marketplace; `hooks/hooks.json` then registers the same three hooks with
`${CLAUDE_PLUGIN_ROOT}` paths while the plugin is enabled.

## Configuration

Same environment variables as the OpenCode plugin, read by the hook script:

| Variable | Default | Purpose |
| --- | --- | --- |
| `NOTIFYHUB_CLI_HOST` | `0.0.0.0` | NotifyHub host |
| `NOTIFYHUB_CLI_PORT` | `9080` | NotifyHub port |
| `NOTIFYHUB_PUSH_SCRIPT` | `~/.config/opencode/plugin/notifyhub-push.py` | Override the CLI path (shared with the OpenCode install) |
| `NOTIFYHUB_CLI_ENABLED` | unset | `false`-like value mutes, without spawning the CLI |

Exporting `NOTIFYHUB_CLI_HOST` or `NOTIFYHUB_CLI_PORT` as an empty string mutes too —
the documented shell mute switch. Muting is evaluated per event, so toggling takes effect
on the next hook invocation without restarting Claude Code (env is inherited per spawn)…

…except that Claude Code hooks inherit the **Claude Code process environment**: set the
variables before launching `claude`, or bake them into the hook `command` in settings.

## Testing

```bash
echo '{"hook_event_name":"Stop","stop_hook_active":false,"last_assistant_message":"done","cwd":"/tmp","transcript_path":"/nonexistent"}' \
  | NOTIFYHUB_PUSH_SCRIPT=./stub.py python3 notifyhub-claude.py
```

Manual verification against a running server: `make backend`, then run a Claude Code turn and watch
`http://localhost:9080` — same payload shape (`{pwd, message}`) as the OpenCode plugin.

## Troubleshooting

- Hooks must appear in `/hooks` inside a session; if missing, check `~/.claude/settings.json` parses.
- Hook stderr goes to Claude Code's debug log: `claude --debug`.
- The script never writes stdout and always exits 0, so it can never block or alter a turn;
  push failures are logged to stderr only.

## Related

- [NotifyHub](../../../..) — the notification server (repo root)
- [Claude Code hooks guide](../../../../docs/important/claude-code-hooks.md) — install, config, gotchas
- [Port plan](../../../../docs/plans/2026/10/23/2026-10-23-claude-code-hooks-port.md) — trials, errors, lessons learnt
- [OpenCode plugin](../opencode) — the v2 plugin this port mirrors
- [Claude Code hooks reference](https://docs.claude.com/en/docs/claude-code/hooks)
