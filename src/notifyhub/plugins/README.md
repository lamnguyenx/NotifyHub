# Coding-agent integrations

| Directory | Integration | Mode |
|---|---|---|
| `opencode/` | OpenCode v2 | resident TypeScript plugin |
| `claude/` | Claude Code | per-event hook script + `settings.json` merge |
| `codex/` | OpenAI Codex | per-event hook script + `hooks.json` merge |

All three push completions through the shared NotifyHub CLI (`notifyhub-push.py`) and report live
session state to `POST /api/status/<agent>/<state>`.

## Machine identity

- The OpenCode plugin sends `host: hostname()` in the status JSON body.
- The Claude/Codex Python hooks send `host: socket.gethostname()`.
- The raw `UserPromptSubmit` / `PostToolUse` curl one-liners send
  `X-NotifyHub-Host: $(hostname)` (Windows: `%COMPUTERNAME%`), because their piped hook payload has
  no machine field and the backend would otherwise record the request's client IP (often a Docker
  bridge address).

Re-run the matching installer after upgrading:
`make install-plugin` (shared push CLI), `make install-plugin-claude`, `make install-plugin-codex`.
Claude sessions need a restart; Codex may need the changed hooks re-trusted via `/hooks`.

## Guides

- [OpenCode plugin](../../../docs/important/opencode-plugin.md)
- [Claude Code hooks](../../../docs/important/claude-code-hooks.md)
- [Codex hooks](../../../docs/important/codex-hooks.md)
- [Agent status](../../../docs/important/agent-status.md)

## Related plans

- [Host-header parent](../../../docs/plans/2026/11/11/2026-11-11-agent-status-host-header-plugins.md)
- [Claude host header](../../../docs/plans/2026/11/11/2026-11-11-agent-status-host-header-plugins-claude.md)
- [Codex host header](../../../docs/plans/2026/11/11/2026-11-11-agent-status-host-header-plugins-codex.md)
