# Machine labels on live and completed cards

All three integrations use the shared push CLI's existing resolution order:

1. Trim `HOST_MODEL`; use it unless empty or exactly `Unknown`.
2. Otherwise use trimmed exported `HOSTNAME` if nonempty.
3. Otherwise use the OS hostname (`socket.gethostname()`, `hostname`, or Node's `hostname()`).

For example, this session had `HOST_MODEL=MS-7E70`, no exported `HOSTNAME`, and OS hostname
`kientt44`. Both live and completed cards should show `MS-7E70`. The override is a display label;
it does not change the backend destination selected by `NOTIFYHUB_CLI_HOST`.

Export the label before starting the agent so its server/hook processes inherit it:

```bash
export HOST_MODEL=MS-7E70
```

## Transport and module ownership

| Producer | Display metadata |
|---|---|
| Shared push CLI | Completed notification `data.host_model` |
| OpenCode plugin | Status JSON `host` |
| Claude/Codex Python reporters | Status JSON `host` |
| Claude/Codex Unix curl definitions | `X-NotifyHub-Host` header, with raw stdin untouched |
| Codex Windows turn-start definition | Python reporter, including `prompt` for task extraction |

The backend already prefers JSON `host`, then the header, then client IP. No backend/TUI code
change was needed for this session. A container/proxy client IP is a fallback, not the label users
expect when reporters can supply one.

## Troubleshooting and rollout

- If completed cards show the configured label but live cards show the OS hostname, update the
  reporter/installed hook definition rather than changing the TUI renderer.
- If a live card shows a bridge IP, inspect the raw hook's installed host header and backend version.
- A shell-local `HOSTNAME` may be unexported. Keep the OS fallback instead of assuming it exists.
- `Unknown` is the exact sentinel; other nonempty labels are explicit overrides.

Run `make install-plugin`, restart Claude and long-lived OpenCode instances, and review changed
Codex hooks via `/hooks`. See [installation](plugin-installation.md).

Module history: [CLI contract](../plans/2026/11/12/2026-11-12-plugin-labels-installation-and-permissions-cli.md),
[plugin parent](../plans/2026/11/12/2026-11-12-plugin-labels-installation-and-permissions-plugins.md),
[Claude](../plans/2026/11/12/2026-11-12-plugin-labels-installation-and-permissions-claude.md),
[Codex](../plans/2026/11/12/2026-11-12-plugin-labels-installation-and-permissions-codex.md), and
[OpenCode](../plans/2026/11/12/2026-11-12-plugin-labels-installation-and-permissions-opencode.md).
