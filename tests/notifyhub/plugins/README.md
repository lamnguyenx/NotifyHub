# Plugin regression tests

These tests cover the [coding-agent integrations](../../../src/notifyhub/plugins/README.md).
Run from the repository root, with the user confirmation required by AGENTS.md:

```bash
python3 -m pytest tests/notifyhub/plugins -q
bun test ./tests/notifyhub/plugins/opencode_plugin.test.ts
npm run typecheck --prefix src/notifyhub/plugins/opencode
```

The Python suite covers lifecycle mapping, installation and plugin layout, human-review filtering,
and shared machine labels. `test_machine_labels.py` runs real Unix hook commands with fake
`curl`/`hostname`, captures urllib requests, checks raw stdin, and checks Codex prompt forwarding.
The Bun suite stubs OpenCode events, pending requests, spawn, and backend fetch, covering labels
and permission-notification cancellation/cleanup races. No live server or model requests are used.

Final results for this session: 61 Python tests and 8 Bun tests passed; OpenCode typechecking passed.
Native Windows execution, live installation, and backend/frontend e2e were not performed.

- [Testing guide](../../../docs/important/plugin-integration-testing.md)
- [Module session record](../../../docs/plans/2026/11/12/2026-11-12-plugin-labels-installation-and-permissions-tests.md)
- [Parent session record](../../../docs/plans/2026/11/12/2026-11-12-plugin-labels-installation-and-permissions.md)
