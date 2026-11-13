# Claude Code hook definitions

`hooks.json` is the plugin-layout distribution of the parent integration. The sibling
`../install.py` generates equivalent installed hook definitions; both must stay aligned.
This layout uses `${CLAUDE_PLUGIN_ROOT}` Python paths, the python turn-start hook, and one
inline running hook.

## Running status, machine labels, and the heartbeat watcher

`UserPromptSubmit` runs `notifyhub-claude.py`: it posts `running` (forwarding the prompt for
the task excerpt), then spawns the detached `--heartbeat` watcher that keeps long turns fresh.
`PostToolUse` stays the raw refresh: it resolves trimmed `HOST_MODEL` (except empty or
`Unknown`), then trimmed exported `HOSTNAME`, then `hostname`; it sends `X-NotifyHub-Host`
while piping the original JSON stdin unchanged through `curl --data-binary @-` (and flips
`blocked → running` after you answer a permission). Backend address variables preserve
exported-empty host/port muting. Watchers live under
`$NOTIFYHUB_HEARTBEAT_DIR` (default `/tmp/notifyhub-claude-heartbeat`) and honor
`NOTIFYHUB_HEARTBEAT_INTERVAL_SECONDS` / `NOTIFYHUB_HEARTBEAT_MAX_MINUTES`
(0 disables); `Stop`/`StopFailure` remove the lease so the watcher exits.

## Install and verify

`make install-plugin` installs all integrations. To refresh only this agent after the shared
push CLI is available, use `make install-plugin-claude`. Restart Claude sessions after changing installed definitions.

From the repository root:

```bash
python3 -m pytest tests/notifyhub/plugins -q
```

The shared machine-label regression exercises the actual Unix command with fake transports and
compares it with installer output. Native Windows execution was not tested in this session.

## Related

- [Parent module](../README.md)
- [Agent guide](../../../../../docs/important/claude-code-hooks.md)
- [Machine labels](../../../../../docs/important/notification-machine-labels.md)
- [Hook-definition session record](../../../../../docs/plans/2026/11/12/2026-11-12-plugin-labels-installation-and-permissions-claude-hooks.md)
