# CLI: machine label contract shared by live status reporters

**Date**: 2026-11-12
**Status**: Implemented in the working tree; installation into live agent configuration remains an operator step.
**Parent**: [2026-11-12-plugin-labels-installation-and-permissions.md](2026-11-12-plugin-labels-installation-and-permissions.md)

## Module and changes

`src/notifyhub/cli/README.md` now describes the shared label contract. The CLI implementation
already resolved `data.host_model` correctly and was not changed:

1. Trim `HOST_MODEL`; use it unless empty or exactly `Unknown`.
2. Otherwise use trimmed exported `HOSTNAME` if nonempty.
3. Otherwise use the OS hostname.

The agent reporters were changed to match this existing behavior. Live `host` and completed
`data.host_model` can therefore both show `MS-7E70` when the OS reports `kientt44`.

## Trials, errors, and lessons learnt

The symptom first looked like a missing machine name or a TUI formatting problem. Reading the CLI
revealed that a deliberate environment override was already working on completed cards. Repair the
inconsistent producers instead of hardcoding a label or adding a display workaround.

`HOSTNAME` may be a shell variable without being exported. Preserve the OS fallback. Trim inputs
and keep `Unknown` handling consistent across Python, shell, and TypeScript.

The CLI README previously implied separate installers copied this file; the Makefile's copy step
actually installs the shared CLI before the aggregate target registers agent hooks. The revised
README makes that ownership explicit.

## Validation and limits

The shared label regression runs against Claude and Codex reporters with overrides, whitespace,
`Unknown`, missing variables, and literal shell-like text. OpenCode has an `MS-7E70` status test.
The Python plugin suite passed 61 tests and the OpenCode suite passed 8. CLI-specific tests were
not rerun because no CLI implementation changed.
