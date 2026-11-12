# Claude Code hook definitions

`hooks.json` is the plugin-layout distribution of the parent integration. The sibling
`../install.py` generates equivalent installed hook definitions; both must stay aligned.
This layout uses `${CLAUDE_PLUGIN_ROOT}` Python paths and the two inline running hooks.

## Running status and machine labels

`UserPromptSubmit` and `PostToolUse` send running status. Unix commands resolve trimmed `HOST_MODEL`
(except empty or `Unknown`), then trimmed exported `HOSTNAME`, then `hostname`. They send
`X-NotifyHub-Host` while piping the original JSON stdin unchanged through `curl --data-binary @-`.
Backend address variables preserve exported-empty host/port muting.

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
