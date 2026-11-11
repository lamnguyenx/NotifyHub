# Claude Code plugin: host header on raw status hooks

**Date**: 2026-11-11
**Status**: Done
**Parent**: [`2026-11-11-agent-status-host-header-plugins.md`](2026-11-11-agent-status-host-header-plugins.md)

Module: `src/notifyhub/plugins/claude/` — `install.py`, `hooks/hooks.json`, `README.md`; tests in
`tests/notifyhub/plugins/test_claude_hooks.py`.

## What changed

`UserPromptSubmit` and `PostToolUse` use the same `status_curl_handler()` command. It now sends:

```text
-H "x-notifyhub-host: $(hostname)"
```

Both the installer template and `hooks/hooks.json` were updated, so a settings merge and
`claude --plugin-dir` produce the same status report.

The Python hook (`notifyhub-claude.py`) already sends `host: socket.gethostname()` in its JSON body
for `blocked`/`idle`; those paths needed no change.

## Design decisions

- **One header on the curl one-liner.** The raw hook payload remains opaque; the server extracts
  `session_id`/`cwd`/prompt as before.
- **`$(hostname)` inside `sh -c`.** The command is already a `sh -c '...'` wrapper for
  `${VAR-default}` expansion; command substitution runs in that inner shell and costs one process
  per hook event.
- **Keep the mute semantics.** Empty `NOTIFYHUB_CLI_HOST`/`_PORT` still short-circuit before curl;
  the header does not change that.

## Trials, errors and lessons

### The installer and plugin layout are two products

`install.py` is used for `~/.claude/settings.json`; `hooks/hooks.json` is used by
`claude --plugin-dir` and marketplace packages. Editing only the installer leaves plugin users on
the IP fallback. The tests now assert both.

**Lesson**: when a plugin has two distribution paths, treat both as first-class outputs.

### A raw payload has no machine field

Claude Code's hook payload does not include a machine name. The hook cannot rely on body data; the
header is the smallest addition that works without parsing stdin.

**Lesson**: inspect the upstream payload before assuming a field exists. The backend was correctly
falling back to the only address it had.

### Restart is part of the fix

Claude Code reads hook definitions at session start (or after `/hooks`). Reinstalling while a
session is running does not change that session's active hooks.

**Lesson**: pair an installer change with "restart the agent" in the same instruction.

## Verification

- `install.merge_hooks({})` produces `x-notifyhub-host: $(hostname)` in both status events.
- `hooks/hooks.json` has the same header in both events.
- `python -m pytest tests/notifyhub/plugins/test_claude_hooks.py -q`: all pass.

## Docs updated

- `src/notifyhub/plugins/claude/README.md` — status mapping, header, reinstall step.
- `docs/important/claude-code-hooks.md` — operator guide note.
- `docs/important/agent-status.md` — shared host precedence.

## Related

- Parent: [`2026-11-11-agent-status-host-header-plugins.md`](2026-11-11-agent-status-host-header-plugins.md)
- Codex: [`2026-11-11-agent-status-host-header-plugins-codex.md`](2026-11-11-agent-status-host-header-plugins-codex.md)
- Backend: [`2026-11-11-agent-status-host-header-backend.md`](2026-11-11-agent-status-host-header-backend.md)
- Original port: [`2026-10-23-claude-code-hooks-port.md`](../../10/23/2026-10-23-claude-code-hooks-port.md)
