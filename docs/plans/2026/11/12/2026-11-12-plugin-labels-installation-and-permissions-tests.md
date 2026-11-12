# Plugin tests: cross-agent machine labels and OpenCode lifecycle races

**Date**: 2026-11-12
**Status**: Implemented in the working tree; installation into live agent configuration remains an operator step.
**Parent**: [2026-11-12-plugin-labels-installation-and-permissions.md](2026-11-12-plugin-labels-installation-and-permissions.md)

## Module and changes

`tests/notifyhub/plugins/` now includes:

- `test_machine_labels.py`: shared parametrized Claude/Codex precedence cases; fake urllib captures
  actual status bodies and prompt forwarding; real shell commands run against fake curl/hostname,
  with header and exact-stdin checks and installer/plugin-layout parity.
- `test_claude_hooks.py`: updated host-header expectations.
- `test_codex_hooks.py`: updated headers/Windows dispatch and a turn-start state mapping test.
- `opencode_plugin.test.ts`: fake event subscription, pending permission API, spawn, and backend
  fetch. Eight scenarios cover labels and permission lifecycle races without live agents or model calls.

A module README links commands, transport boundaries, the testing guide, and this history.

## Trials, errors, and lessons learnt

The user explicitly approved focused hook tests before they ran, as required by AGENTS.md.
The first Claude-only suite passed 16 tests. The label cases were later extracted and run for both
Python integrations; the final Python suite passed 61 tests.

The initial Bun filename `test_opencode_plugin.ts` was not discovered: Bun requires a recognized
`.test`/`.spec` naming pattern or explicit path handling. Renaming to `opencode_plugin.test.ts`
and using `bun test ./tests/...` fixed discovery. Seven permission tests passed, then an eighth
machine-label regression was added and all eight passed.

`git diff --check` found a trailing blank line during the extraction; it was removed and the check
passed. SDK typechecking caught no errors. Infrastructure sandbox failures happened before test
execution and should not be recorded as application test failures.

## Validation and boundaries

```bash
python3 -m pytest tests/notifyhub/plugins -q
bun test ./tests/notifyhub/plugins/opencode_plugin.test.ts
npm run typecheck --prefix src/notifyhub/plugins/opencode
make -n install-plugin
```

Results: 61 Python tests passed, 8 Bun tests passed, typecheck passed, dry-run installer expansion
passed. A dry run is not a deployment test; Python prompt/definition assertions do not prove native
Windows execution. No frontend, backend, live TUI, or live agent e2e tests were run this session.
Do not add a live server prerequisite to these isolated suites; follow AGENTS.md's startup and
confirmation workflow when moving to web-service development or integration testing.
