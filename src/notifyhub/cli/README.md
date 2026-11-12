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

1. Trimmed `HOST_MODEL` — explicit label/model override, except empty or exactly `Unknown`.
2. Trimmed exported `HOSTNAME`.
3. `socket.gethostname()` — OS fallback (bash does not export `HOSTNAME` by default).

OpenCode, Claude, and Codex live-status reporters use the same precedence, so their waiting cards
and completed notifications carry the same label.

`make install-plugin-copy` copies this file to `~/.config/opencode/plugin/notifyhub-push.py` alongside
OpenCode. `make install-plugin` runs that copy step first, then registers Claude and Codex hooks.
Re-run the aggregate target after upgrading; the per-agent hook installers do not copy the CLI.

## Tests

`python -m pytest tests/notifyhub/cli -q`

## Related

- [CLI plan](../../../docs/plans/2026/11/11/2026-11-11-agent-status-host-header-cli.md)
- [CLI usage](../../../README.md#15-cli-usage)
- [Funnel push guide](../../../docs/important/funnel-remote-push.md)

## 2026-11-12 session record

- [Module changes, trials, errors, and lessons](../../../docs/plans/2026/11/12/2026-11-12-plugin-labels-installation-and-permissions-cli.md)
- [Full session and module map](../../../docs/plans/2026/11/12/2026-11-12-plugin-labels-installation-and-permissions.md)
- [Installation and rollout](../../../docs/important/plugin-installation.md)
- [Shared machine label contract](../../../docs/important/notification-machine-labels.md)
- [Focused regression checks](../../../docs/important/plugin-integration-testing.md)
