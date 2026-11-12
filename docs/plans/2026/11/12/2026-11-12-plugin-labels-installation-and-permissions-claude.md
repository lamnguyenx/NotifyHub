# Claude: matching live status and completion machine labels

**Date**: 2026-11-12
**Status**: Implemented in the working tree; installation into live agent configuration remains an operator step.
**Parent**: [2026-11-12-plugin-labels-installation-and-permissions-plugins.md](2026-11-12-plugin-labels-installation-and-permissions-plugins.md)

## Module and changes

`notifyhub-claude.py` now resolves `body.host` with `machine_label()` using the shared CLI
precedence. Permission/input `blocked` and completion `idle` reports match completion card labels.
The installer and plugin-layout running hooks also use that precedence; details are recorded in
[Claude hook definitions](2026-11-12-plugin-labels-installation-and-permissions-claude-hooks.md).

The integration README documents environment inheritance, installation, and consistent labels.
No TUI/backend changes were required.

## Trials, errors, and lessons learnt

Read-only inspection of installed NotifyHub entries showed the hostname header was already present.
The environment had `HOST_MODEL=MS-7E70`, no exported `HOSTNAME`, and OS hostname `kientt44`.
The status reporter used only the OS hostname while the push CLI honored the explicit override.
Check both installed definitions and runtime values before blaming an old installation.

The first focused Claude run passed 16 tests. Shared precedence cases were subsequently moved into
a parametrized cross-agent test file to cover Codex without copying the same fake transport.

Keep notification and status metadata aligned while preserving mute rules and fail-soft reports.
Hook definitions copied into settings still require reinstall/restart even when the Python script
itself runs directly from the repository.

## Validation and rollout

The final Python plugin suite passed 61 tests. Fake urllib and curl transports exercised the
actual label bytes without network traffic. Run `make install-plugin` (or refresh just Claude with
`make install-plugin-claude` when the shared CLI exists), then restart Claude sessions.
