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
| `make install-plugin-ssh` | Install the aggregate set on hosts picked from `~/.ssh/config` |

The existing removal targets remain separate: `make remove-plugin` removes OpenCode/shared files;
`make remove-plugin-claude` and `make remove-plugin-codex` remove their hook definitions. The aggregate
installation change did not add aggregate removal. Claude/Codex notifications depend on the shared
push script, so removing it affects them too.

## Install on SSH hosts

`make install-plugin-ssh` ships the aggregate set to other machines. Hosts are picked from
`~/.ssh/config`, but only the ones marked with a `# notifyhub` comment on their `Host` line:

```
Host nuc  # notifyhub
Host wsk* # notifyhub
```

The marker claims every alias on its line, and wildcard patterns expand to every concrete
alias they match (`wsk*` above covers `wsk` and `wske`). With no marked hosts at all every
host stays eligible, so the notation is opt-in. The picker, `--all`, and explicit `-H` names
all resolve within that universe. On each host the files land exactly as `make install-plugin`
would place them locally: the OpenCode pair in `~/.config/opencode/plugin/`, and the
Claude/Codex hook scripts in `~/.config/notifyhub/plugin/` (merged into settings by that
host's own `install.py`, so hook paths stay absolute and persistent). Anything being replaced
is archived `__archived__/`-style first, per host. Hosts run in parallel (four by default)
with a colored tag per host; a failing host does not stop the rest.

Without prompts: `make install-plugin-ssh ARGS="-t opencode,claude -H nuc,pp"`, with `all`
accepted for either list, `--dry-run` to print the plan, `-j N` to change parallelism, and
`ARGS='--ssh-hosts "*"'` to escape the marker limit for one run. After the run the script
prints a hint with this machine's LAN address: remote hooks default to `127.0.0.1:9080`, so
each host needs `NOTIFYHUB_CLI_HOST` (or `cli.host` in that host's NotifyHub config) pointing
at the server machine. The rollout's design history — a NotifyHub config glob list that was
built and reverted in favor of the ssh-config marker, the tar-over-ssh transport, and testing
against re-homed sandboxes instead of live hosts — is recorded in the
[parent session record](../plans/2026/11/12/2026-11-12-install-plugin-ssh.md).

## Verify without installing

```bash
make -n install-plugin
```

The dry run should show the shared files copied before both hook installers. It does not modify
live settings and does not prove installation or agent delivery. This session performed the dry run,
not a real installation.

See [machine labels](notification-machine-labels.md), [isolated plugin tests](plugin-integration-testing.md),
and the [parent session record](../plans/2026/11/12/2026-11-12-plugin-labels-installation-and-permissions.md).
