# Codex hook definitions: Unix label headers and Windows Python dispatch

**Date**: 2026-11-12
**Status**: Implemented in the working tree; installation into live agent configuration remains an operator step.
**Parent**: [2026-11-12-plugin-labels-installation-and-permissions-codex.md](2026-11-12-plugin-labels-installation-and-permissions-codex.md)

## Module and changes

`src/notifyhub/plugins/codex/hooks/hooks.json` and `install.py` now emit a Unix running hook whose
header honors the shared CLI label precedence. Their Windows turn-start branch invokes
`notifyhub-codex.py`: the installer uses its quoted Python interpreter/repository path; the plugin
layout uses `py -3` and `%PLUGIN_ROOT%`, matching its other Python hook definitions.

The Windows reporter handles `UserPromptSubmit`, sets running status, and carries the prompt for
server-side task extraction. Unix preserves `curl --data-binary @-`, timeout, async, and destination
mute behavior. A local README identifies both distribution paths and the deployment/trust steps.

## Trials, errors, and lessons learnt

An OS-only header is present but semantically wrong when completion cards use `HOST_MODEL`.
Tests that only search for `$(hostname)` needed updating to test the real label contract.
The Unix commands are exercised with a fake curl and compared with installer-generated commands.
Windows assertions now check Python dispatch rather than the retired `%COMPUTERNAME%` header.

Keep platform-specific command dispatch explicit; reusing a reporter is safer than growing cmd
expressions that implement a second version of label fallback and whitespace handling.

## Validation and limits

Python plugin suite: 61 passed, including both integrations' shell cases and Codex prompt forwarding.
These are Linux-hosted checks, not proof of a native Windows launch. The installed Codex definition
changes and therefore needs review through `/hooks` after `make install-plugin`.
