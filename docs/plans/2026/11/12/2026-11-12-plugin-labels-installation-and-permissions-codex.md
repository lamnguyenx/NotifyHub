# Codex: consistent labels and a Windows turn-start reporter

**Date**: 2026-11-12
**Status**: Implemented in the working tree; installation into live agent configuration remains an operator step.
**Parent**: [2026-11-12-plugin-labels-installation-and-permissions-plugins.md](2026-11-12-plugin-labels-installation-and-permissions-plugins.md)

## Module and changes

`notifyhub-codex.py` now uses `machine_label()` with shared CLI precedence for all status reports.
It recognizes `UserPromptSubmit` as `running` and forwards the string prompt on that event. This
supports the Windows running hook's switch from raw cmd curl to the existing Python reporter.

Unix turn-start hooks retain curl and raw stdin. The installer and plugin-layout branches are
covered in [Codex hook definitions](2026-11-12-plugin-labels-installation-and-permissions-codex-hooks.md).
READMEs and the important guide explain installation and re-trusting changed definitions.

## Trials, errors, and lessons learnt

After diagnosing Claude, the user reported the same issue for “code”; it was interpreted as Codex,
and the Codex implementation indeed had the same OS-hostname-only behavior. OpenCode was then
examined and fixed separately when explicitly discussed.

Windows previously stamped `%COMPUTERNAME%`, so fixing only Unix would preserve a divergent path.
Using the Python reporter reuses label resolution. That change also requires a running-event mapping
and forwarding the prompt: changing a command alone would lose lifecycle/task behavior.

Do not confuse Codex's existing human-review filtering with OpenCode's client autoaccept race.
Those are different approval mechanisms; this session did not replace Codex's reviewer logic.

## Validation and limits

The final Python plugin suite passed 61 tests. Tests exercise label precedence, generated definitions,
event mapping, and prompt forwarding through fake urllib. Native Windows process execution and
live Codex trust were not tested. Install with `make install-plugin`, then review changed hooks
through `/hooks`; repository edits alone do not refresh copied hook definitions.
