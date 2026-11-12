# Plugins: shared labels and one installation entry point

**Date**: 2026-11-12
**Status**: Implemented in the working tree; installation into live agent configuration remains an operator step.
**Parent**: [2026-11-12-plugin-labels-installation-and-permissions.md](2026-11-12-plugin-labels-installation-and-permissions.md)

## Module and changes

`src/notifyhub/plugins/` coordinates three integrations sharing the push CLI. Claude, Codex, and
OpenCode now resolve status labels like completion cards, rather than always sending OS hostname.
Python and OpenCode reporters use JSON `host`; Unix curl definitions use `X-NotifyHub-Host` and
preserve raw stdin. Codex's Windows turn-start definition now uses its Python reporter.

`make install-plugin` refreshes all three integrations; `install-plugin-copy`,
`install-plugin-claude`, and `install-plugin-codex` remain available for individual updates.

## Submodules

- [Claude](2026-11-12-plugin-labels-installation-and-permissions-claude.md), including its
  [hook definitions](2026-11-12-plugin-labels-installation-and-permissions-claude-hooks.md).
- [Codex](2026-11-12-plugin-labels-installation-and-permissions-codex.md), including its
  [hook definitions](2026-11-12-plugin-labels-installation-and-permissions-codex-hooks.md).
- [OpenCode](2026-11-12-plugin-labels-installation-and-permissions-opencode.md).
- Shared contracts: [CLI](2026-11-12-plugin-labels-installation-and-permissions-cli.md) and
  [regression tests](2026-11-12-plugin-labels-installation-and-permissions-tests.md).

## Trials, errors, and lessons learnt

The original fix supplied a hostname header but did not honor the user-facing label override.
Checking only for a header misses semantic drift between status and completion producers.
The same mismatch existed in multiple agents; each needed its own implementation and regression
coverage. The OpenCode change also required separate analysis of client-driven auto approval.

Do not confuse the NotifyHub destination (`NOTIFYHUB_CLI_HOST`) with the reporting label
(`HOST_MODEL` / `HOSTNAME`). Changing one must not silently change the other.

## Validation and limits

The Python suite passed 61 tests; the OpenCode suite passed 8 tests and SDK typechecking. Module
READMEs link the current operating guides and this history. No live configurations were installed;
restart/re-trust steps remain after `make install-plugin`.
