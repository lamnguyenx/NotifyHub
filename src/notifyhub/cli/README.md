# NotifyHub CLI

Push a notification from a shell, script or coding-agent hook.

```bash
python src/notifyhub/cli/cli.py 'hello'
python src/notifyhub/cli/cli.py --dry-run 'test payload'
```

The default target is `http://0.0.0.0:9080`. `NOTIFYHUB_CLI_HOST`, `_PORT` and `_SCHEME` override
it; an exported-empty host or port is the mute switch. `NOTIFYHUB_CLI_ENABLED=false` also mutes.

## Machine tag

`data.host_model` is resolved as:

1. `HOST_MODEL` — explicit label/model override.
2. Exported `HOSTNAME`.
3. `socket.gethostname()` — OS fallback (bash does not export `HOSTNAME` by default).

With no explicit `HOST_MODEL`, this is the machine name and matches the waiting card's `host` pill
on the TUI. Setting `HOST_MODEL` intentionally overrides the completed notification's tag (for
example with a model name).

The OpenCode/Claude/Codex installers copy this file to
`~/.config/opencode/plugin/notifyhub-push.py`. Re-run `make install-plugin` after changing it.

## Tests

`python -m pytest tests/notifyhub/cli -q`

## Related

- [CLI plan](../../../docs/plans/2026/11/11/2026-11-11-agent-status-host-header-cli.md)
- [CLI usage](../../../README.md#15-cli-usage)
- [Funnel push guide](../../../docs/important/funnel-remote-push.md)
