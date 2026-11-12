# Claude hook definitions: configured label in raw status headers

**Date**: 2026-11-12
**Status**: Implemented in the working tree; installation into live agent configuration remains an operator step.
**Parent**: [2026-11-12-plugin-labels-installation-and-permissions-claude.md](2026-11-12-plugin-labels-installation-and-permissions-claude.md)

## Module and changes

`src/notifyhub/plugins/claude/hooks/hooks.json` and the corresponding `install.py` template now
choose the label from trimmed `HOST_MODEL`, trimmed exported `HOSTNAME`, then `hostname`.
Empty or exactly `Unknown` model labels fall through. Both `UserPromptSubmit` and `PostToolUse`
send the result as `X-NotifyHub-Host`; raw JSON stdin is still piped through `--data-binary @-`.

A hooks-directory README now explains the plugin distribution, installer counterpart, deployment,
and regression commands. This directory is a distinct distribution surface of the parent integration.

## Trials, errors, and lessons learnt

The earlier `$(hostname)` header fixed client-IP fallback, but could not match a custom label.
Replacing it only in the installer would leave `claude --plugin-dir` users inconsistent.
The session therefore changed both copies and asserted command equality for both running events.

Shell parameter expansion trims and selects the label without parsing the payload or starting
Python on every tool event. Quoted expansion preserves spaces and literal `$(hostname)` text in
labels instead of evaluating it as code. Preserve `${VAR-default}` destination semantics so an
exported-empty host or port continues to mute delivery.

## Validation and limits

The shared regression invokes the real shell command using fake `hostname` and `curl` executables,
checks the transmitted header, and asserts stdin stays byte-for-byte identical. Python suite:
61 passed. No live settings were rewritten during this session.
