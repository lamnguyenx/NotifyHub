# Codex plugin: host header on raw status hooks

**Date**: 2026-11-11
**Status**: Done
**Parent**: [`2026-11-11-agent-status-host-header-plugins.md`](2026-11-11-agent-status-host-header-plugins.md)

Module: `src/notifyhub/plugins/codex/` — `install.py`, `hooks/hooks.json`, `README.md`; tests in
`tests/notifyhub/plugins/test_codex_hooks.py`.

## What changed

The only raw curl hook is `UserPromptSubmit` (turn start → `running`). It now sends the machine
header on both platforms:

```text
Unix:    -H "x-notifyhub-host: $(hostname)"
Windows: -H "x-notifyhub-host: %COMPUTERNAME%"
```

Both the installer template and `hooks/hooks.json` were updated. `PostModelRequest` and the other
state reports go through `notifyhub-codex.py`, which already sends `host: socket.gethostname()` in
the JSON body.

## Design decisions

- **The header is only on the raw hook.** The Python script already has structured JSON; adding a
  duplicate header there would be redundant.
- **`%COMPUTERNAME%` for `commandWindows`.** Codex's Windows command runs under `cmd`, not
  `sh -c`; POSIX command substitution would be a literal string.
- **Do not change the sync/async split.** `UserPromptSubmit` remains async with a 3-second timeout;
  the header adds negligible time.
- **Keep trust semantics.** The command text changes, so Codex may ask to re-trust the hook via
  `/hooks`.

## Trials, errors and lessons

### One raw hook, two operating-system branches

Codex is the only integration with a `commandWindows` field. The Unix fix and the Windows fix are
different syntax; a test that only checks the Unix string would miss a broken Windows hook.

**Lesson**: assert both platform branches when a hook has a Windows variant.

### The Python heartbeat already reported the host

`PostModelRequest` goes through `notifyhub-codex.py`, so a running entry could start with an IP
from `UserPromptSubmit` and later be corrected by the heartbeat. That produced an inconsistent
card instead of a consistent one.

**Lesson**: mixed reporters for the same field need the same source. Fix the raw path too, not only
the structured one.

### Re-trust is a user step

Codex records trust per hook definition/hash. Changing the command can invalidate the previously
trusted entry even though the installer replaces it in place.

**Lesson**: after an installer change, say "open `/hooks` and trust" explicitly; otherwise the
hook silently does not run.

## Verification

- Installer: Unix command contains `$(hostname)`, `commandWindows` contains `%COMPUTERNAME%`.
- Plugin layout: both fields contain the same header.
- `python -m pytest tests/notifyhub/plugins/test_codex_hooks.py -q`: all pass.

## Docs updated

- `src/notifyhub/plugins/codex/README.md` — status mapping, header, re-trust note.
- `docs/important/codex-hooks.md` — operator guide note.
- `docs/important/agent-status.md` — shared host precedence.

## Related

- Parent: [`2026-11-11-agent-status-host-header-plugins.md`](2026-11-11-agent-status-host-header-plugins.md)
- Claude: [`2026-11-11-agent-status-host-header-plugins-claude.md`](2026-11-11-agent-status-host-header-plugins-claude.md)
- Backend: [`2026-11-11-agent-status-host-header-backend.md`](2026-11-11-agent-status-host-header-backend.md)
- Original port: [`2026-11-09-codex-hooks-port.md`](../../11/09/2026-11-09-codex-hooks-port.md)
