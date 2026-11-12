# Install and update coding-agent integrations

From the repository root:

```bash
make install-plugin
```

This copies the OpenCode plugin and shared `notifyhub-push.py` into
`~/.config/opencode/plugin/`, then runs the Claude and Codex hook installers. The Claude installer
merges NotifyHub entries into `~/.claude/settings.json`; the Codex installer merges into
`~/.codex/hooks.json` (or `$CODEX_HOME/hooks.json`). Both preserve unrelated entries.
Recursive make starts the hook phase after the shared CLI copy succeeds.

## Refresh running agents

- Restart Claude sessions to load changed hook definitions and inherit current environment values.
- Restart long-lived OpenCode server/TUI processes after upgrading; a file watcher is not proof
  that every existing instance has loaded the new plugin.
- Review changed Codex definitions through `/hooks`. Trust is managed by Codex, not by this target.

For individual updates:

| Command | Effect |
|---|---|
| `make install-plugin-copy` | Copy OpenCode plugin and shared push CLI only |
| `make install-plugin-symlink` | Symlink those OpenCode/shared files for live editing |
| `make install-plugin-claude` | Refresh Claude definitions; shared push CLI must already exist |
| `make install-plugin-codex` | Refresh Codex definitions; shared push CLI must already exist |

The existing removal targets remain separate: `make remove-plugin` removes OpenCode/shared files;
`make remove-plugin-claude` and `make remove-plugin-codex` remove their hook definitions. The aggregate
installation change did not add aggregate removal. Claude/Codex notifications depend on the shared
push script, so removing it affects them too.

## Verify without installing

```bash
make -n install-plugin
```

The dry run should show the shared files copied before both hook installers. It does not modify
live settings and does not prove installation or agent delivery. This session performed the dry run,
not a real installation.

See [machine labels](notification-machine-labels.md), [isolated plugin tests](plugin-integration-testing.md),
and the [parent session record](../plans/2026/11/12/2026-11-12-plugin-labels-installation-and-permissions.md).
