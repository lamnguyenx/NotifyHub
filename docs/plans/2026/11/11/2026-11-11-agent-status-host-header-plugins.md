# Plugins: machine host header for raw status hooks

**Date**: 2026-11-11
**Status**: Done
**Parent**: [`2026-11-11-tui-waiting-card-machine-id.md`](2026-11-11-tui-waiting-card-machine-id.md)

Module: `src/notifyhub/plugins/` — `claude/` and `codex/` installers, hook templates and READMEs;
tests in `tests/notifyhub/plugins/`.

## Module map

| Submodule | Plan |
|---|---|
| `src/notifyhub/plugins/claude/` | [`2026-11-11-agent-status-host-header-plugins-claude.md`](2026-11-11-agent-status-host-header-plugins-claude.md) |
| `src/notifyhub/plugins/codex/` | [`2026-11-11-agent-status-host-header-plugins-codex.md`](2026-11-11-agent-status-host-header-plugins-codex.md) |

## Goal

The Claude and Codex `UserPromptSubmit`/`PostToolUse` status hooks pipe the upstream hook payload
straight to `curl --data-binary @-`. The payload has `session_id`, `cwd` and the prompt, but no
`host`. The backend therefore stamped the request's client address — a Docker bridge IP
(`172.21.0.1`) when the backend runs behind a container — instead of the machine name.

The fix must not add interpreter startup or a JSON-rewriting dependency to the per-tool-call hot
path. The opencode plugin already sends `host: hostname()` in its JSON body and needed no change.

## What changed

- The raw status one-liners add one header:

  ```text
  -H "x-notifyhub-host: $(hostname)"          # Unix sh
  -H "x-notifyhub-host: %COMPUTERNAME%"       # Windows cmd (Codex)
  ```

- Both copies of each hook definition were updated:
  - the Python installer template (`install.py`), used for the settings/hooks merge;
  - the plugin-layout `hooks/hooks.json`, used by `claude --plugin-dir` and Codex plugin installs.
- The backend prefers `body.host`, then `X-NotifyHub-Host`, then the client address (see the
  backend plan).

## Design decisions

- **Header, not body injection.** `sed`/`jq` would either add a dependency or perform fragile JSON
  surgery on the hot path. `$(hostname)` is one extra process per event, comparable to `curl`.
- **OS hostname, not `$HOSTNAME`.** `HOSTNAME` is often unexported; `hostname` is always available
  on Unix. Windows already exposes `%COMPUTERNAME%`.
- **Body still wins.** The opencode plugin and the Python hook scripts keep sending `host` in the
  body; the header is only for the thin shell clients.
- **Both distribution paths updated.** Installer and plugin-layout JSON are separate files; a fix
  in one must not leave the other sending an IP.
- **No new trust mechanism.** The header is display metadata; the backend is already unauthenticated
  when published. The existing mute env and timeouts are unchanged. Codex still re-checks the
  changed hook definition through its normal `/hooks` trust flow.

## Trials, errors and lessons

### Raw payloads are deliberately opaque

The one-liners are fast because they never parse or rewrite stdin. Adding the machine name to the
body would have required a parser; the header kept the payload opaque.

**Lesson**: when a hot path deliberately treats data as opaque, put metadata beside the payload
(headers, query params) rather than reopening the payload.

### The same command lives in two files per agent

`install.py` builds the settings-merge entry; `hooks/hooks.json` ships the plugin layout. The first
edit only touched the installer. The tests now assert both copies.

**Lesson**: duplicate configuration needs duplicate assertions, or a single source of truth.

### Windows needs a different variable

`$(hostname)` is a POSIX shell substitution; Codex's `commandWindows` runs under `cmd`, which uses
`%COMPUTERNAME%`. The Unix command and `commandWindows` are asserted separately.

**Lesson**: test each platform's branch even when the logic reads the same; shell substitution is
not portable.

### Installing is not editing

The hooks on this machine were copies in `~/.claude/settings.json`, `~/.codex/hooks.json` and
`~/.config/opencode/plugin/notifyhub-push.py`. The repo change had no effect until
`make install-plugin`, `make install-plugin-claude` and `make install-plugin-codex` ran, and running
agents need a restart to reload hook definitions.

**Lesson**: a fix to a copy-based integration has a deployment step. Put it in the README, the
plan and the final verification.

### Codex may ask for trust again

Codex records trust against the hook definition/hash. Changing the command can invalidate the
trusted entry; `/hooks` is the user's step.

**Lesson**: mention re-trust explicitly; a silent hook after an installer change is usually trust,
not a bug.

## Verification

- Claude: `UserPromptSubmit` and `PostToolUse` commands contain `x-notifyhub-host: $(hostname)`;
  plugin-layout JSON asserted too.
- Codex: Unix command contains `$(hostname)`, `commandWindows` contains `%COMPUTERNAME%`; plugin
  layout asserted too.
- `python -m pytest tests/notifyhub/plugins -q`: all pass.
- Backend header precedence and host-change broadcast covered in
  `tests/notifyhub/backend/test_status.py`.

## Docs updated

- `src/notifyhub/plugins/claude/README.md`, `src/notifyhub/plugins/codex/README.md` — status
  one-liner header and reinstall/trust notes.
- `docs/important/claude-code-hooks.md`, `docs/important/codex-hooks.md` — same, operator-facing.
- `docs/important/agent-status.md` — host-source precedence.

## Related

- Parent: [`2026-11-11-tui-waiting-card-machine-id.md`](2026-11-11-tui-waiting-card-machine-id.md)
- Claude: [`2026-11-11-agent-status-host-header-plugins-claude.md`](2026-11-11-agent-status-host-header-plugins-claude.md)
- Codex: [`2026-11-11-agent-status-host-header-plugins-codex.md`](2026-11-11-agent-status-host-header-plugins-codex.md)
- Backend: [`2026-11-11-agent-status-host-header-backend.md`](2026-11-11-agent-status-host-header-backend.md)
