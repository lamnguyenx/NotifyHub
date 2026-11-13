# Plugin regression tests

These tests cover the [coding-agent integrations](../../../src/notifyhub/plugins/README.md).
Run from the repository root, with the user confirmation required by AGENTS.md:

```bash
python3 -m pytest tests/notifyhub/plugins -q
bun test ./tests/notifyhub/plugins/opencode_plugin.test.ts
npm run typecheck --prefix src/notifyhub/plugins/opencode
```

The Python suite covers lifecycle mapping, installation and plugin layout, human-review filtering,
shared machine labels, and the turn-heartbeat leases/watchers (claim, steal, stop, loop, age cap).
`test_machine_labels.py` runs real Unix hook commands with fake `curl`/`hostname`, captures urllib
requests, checks raw stdin, and checks Codex prompt forwarding. The Bun suite stubs OpenCode
events, pending requests, spawn, and backend fetch, covering labels,
permission-notification cancellation/cleanup races, and the running-turn heartbeat ticker.
No live server or model requests are used.

Final results for this session: 83 Python tests and 13 Bun tests passed; OpenCode typechecking
passed. Native Windows execution, live installation, and backend/frontend e2e were not performed.

- [Testing guide](../../../docs/important/plugin-integration-testing.md)
- Heartbeat session record: [`2026-11-13-agent-status-heartbeats.md`](../../../docs/plans/2026/11/13/2026-11-13-agent-status-heartbeats.md)
- [Module session record](../../../docs/plans/2026/11/12/2026-11-12-plugin-labels-installation-and-permissions-tests.md)
- [Parent session record](../../../docs/plans/2026/11/12/2026-11-12-plugin-labels-installation-and-permissions.md)
