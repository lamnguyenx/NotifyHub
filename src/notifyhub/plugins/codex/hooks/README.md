# Codex hook definitions

`hooks.json` is the plugin-layout distribution of the parent integration. The sibling
`../install.py` generates equivalent installed hook definitions; both must stay aligned.
This layout uses `${PLUGIN_ROOT}` / `%PLUGIN_ROOT%` Python paths and the turn-start hook.

## Running status and machine labels

`UserPromptSubmit` sends running status. Unix commands resolve trimmed `HOST_MODEL`
(except empty or `Unknown`), then trimmed exported `HOSTNAME`, then `hostname`. They send
`X-NotifyHub-Host` while piping the original JSON stdin unchanged through `curl --data-binary @-`.
Backend address variables preserve exported-empty host/port muting.

Codex's Windows turn-start definition uses the Python reporter to share label resolution.
The reporter recognizes `UserPromptSubmit` and forwards its prompt for task extraction.

## Install and verify

`make install-plugin` installs all integrations. To refresh only this agent after the shared
push CLI is available, use `make install-plugin-codex`. Review changed Codex definitions through `/hooks` after installation.

From the repository root:

```bash
python3 -m pytest tests/notifyhub/plugins -q
```

The shared machine-label regression exercises the actual Unix command with fake transports and
compares it with installer output. Native Windows execution was not tested in this session.

## Related

- [Parent module](../README.md)
- [Agent guide](../../../../../docs/important/codex-hooks.md)
- [Machine labels](../../../../../docs/important/notification-machine-labels.md)
- [Hook-definition session record](../../../../../docs/plans/2026/11/12/2026-11-12-plugin-labels-installation-and-permissions-codex-hooks.md)
