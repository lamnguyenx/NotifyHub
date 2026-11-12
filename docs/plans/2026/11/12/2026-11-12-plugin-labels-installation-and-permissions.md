# Plugin machine labels, unified installation, and OpenCode permission alerts

**Date**: 2026-11-12
**Status**: Implemented in the working tree; installation into live agent configuration remains an operator step.

## Scope and module records

The work began with a Claude waiting card failing to use `MS-7E70`, expanded to Codex and
OpenCode, and added a single installation command and an OpenCode autoaccept notification fix.

| Module | Session record |
|---|---|
| Repository / Makefile | This document |
| Plugin parent | [Plugins](2026-11-12-plugin-labels-installation-and-permissions-plugins.md) |
| Shared CLI contract | [CLI](2026-11-12-plugin-labels-installation-and-permissions-cli.md) |
| Claude integration | [Claude](2026-11-12-plugin-labels-installation-and-permissions-claude.md) |
| Claude hook definitions | [Claude hooks](2026-11-12-plugin-labels-installation-and-permissions-claude-hooks.md) |
| Codex integration | [Codex](2026-11-12-plugin-labels-installation-and-permissions-codex.md) |
| Codex hook definitions | [Codex hooks](2026-11-12-plugin-labels-installation-and-permissions-codex-hooks.md) |
| OpenCode integration | [OpenCode](2026-11-12-plugin-labels-installation-and-permissions-opencode.md) |
| Plugin regression suite | [Tests](2026-11-12-plugin-labels-installation-and-permissions-tests.md) |

## Result

- Live reporters now match completion notifications: trimmed `HOST_MODEL`, except empty or
  `Unknown`; then trimmed exported `HOSTNAME`; then OS hostname. Here `HOST_MODEL=MS-7E70`
  differs from the OS hostname `kientt44`.
- `make install-plugin` first copies OpenCode and the shared CLI, then invokes the Claude and
  Codex installer targets through recursive make. Individual installation targets remain.
- OpenCode permission alerts and `blocked` status wait one second, cancel on replies, and
  confirm pending requests through the public API. Session events and context API reads remain.
- Updated module READMEs and operator guides; no backend or TUI implementation changes were needed.

## Trials, errors, and lessons learnt

1. The raw host header already existed in both repository and installed Claude settings. A stale
   installation was initially plausible, but inspection showed the real discrepancy was label
   precedence. Trace the value from environment to transport before changing the renderer.
2. Ordinary sandbox commands failed before execution with `bwrap: loopback: Failed RTM_NEWADDR`.
   Commands were retried through reviewed escalation; the failure was environmental, not a test failure.
3. Initially each integration required a separate refresh command. The user requested one command;
   the Makefile now installs the shared CLI before registering its consumers, including with parallel make.
4. A successful make dry run shows command expansion, not installation. No session command ran
   the real aggregate installer or changed the user's installed settings.
5. A notification fix can have multiple distribution copies and lifecycle races. Record the parent,
   each integration, hook templates, and the tests rather than documenting only the top-level symptom.

## Validation and remaining rollout

- `python3 -m pytest tests/notifyhub/plugins -q`: **61 passed**.
- `bun test ./tests/notifyhub/plugins/opencode_plugin.test.ts`: **8 passed**.
- `npm run typecheck --prefix src/notifyhub/plugins/opencode`: passed.
- `make -n install-plugin`: expanded OpenCode/shared CLI copy followed by both hook installers.
- `git diff --check`: passed after removing a trailing blank line found during editing.
- Documentation review: 172 local Markdown links checked across 25 changed/new Markdown files;
  all targets exist. Nine dated records cover the parent and affected submodules.

Run `make install-plugin` to deploy. Restart Claude and long-lived OpenCode processes, and review
changed Codex definitions through `/hooks`. Tests used stubs, not live backend/frontend servers or
model calls. Native Windows execution was not tested. OpenCode auto replies slower than one second
can still notify; the grace period does not expose the TUI's local mode to the server plugin.
