# Isolated plugin integration checks

Run these commands from the repository root after obtaining the test confirmation required by
[AGENTS.md](../../AGENTS.md):

```bash
python3 -m pytest tests/notifyhub/plugins -q
bun test ./tests/notifyhub/plugins/opencode_plugin.test.ts
npm run typecheck --prefix src/notifyhub/plugins/opencode
make -n install-plugin
```

These checks do not need a live backend, an OpenCode server, or a model request. When doing
live integration testing, follow AGENTS.md's server startup and user confirmation workflow separately.

## What is covered

| Suite | Boundary exercised |
|---|---|
| `test_machine_labels.py` | Claude/Codex urllib body capture; actual Unix hook commands with fake curl/hostname; whitespace/fallback precedence; raw stdin preservation; command parity; Codex turn-start prompt |
| `test_claude_hooks.py` | Claude lifecycle and installer/plugin-layout assertions |
| `test_codex_hooks.py` | Codex lifecycle, human-review filtering, installer merges, dispatch and plugin layout |
| `opencode_plugin.test.ts` | Stubbed event subscription, pending API, child spawn and fetch; labels; autoaccept cancellation; real pending requests; missed replies; cancellation during lookup; idle/disposal; overlapping permissions |
| OpenCode typecheck | Plugin compatibility with installed SDK types; here `@opencode/plugin` 2.0.18 |
| Make dry run | Aggregate installation command order, without writing installed configuration |

The final session runs passed **61 Python tests** and **8 Bun tests**. Typechecking and make dry-run
expansion passed. No native Windows launch or live backend/agent e2e test was performed.

## Lessons for future regressions

- Use `.test.ts` and an explicit `./tests/...` path for Bun discovery. The initial
  `test_opencode_plugin.ts` name was not discovered.
- Keep fake transports local to the test process; do not spend model tokens to reproduce lifecycle events.
- Test both installed-template and plugin-layout commands; checking only for a host header misses wrong values.
- Do not block the event loop while waiting for an autoaccept reply. Test cancellation after awaited work,
  multiple pending requests, and cleanup when a session/plugin ends.
- Verify the Windows Python event mapping and prompt forwarding, but report native Windows execution
  as untested until it has actually run there.
- A one-second grace period suppresses fast client autoaccept, not all possible slow-client replies.

See the [test module README](../../tests/notifyhub/plugins/README.md),
[test session record](../plans/2026/11/12/2026-11-12-plugin-labels-installation-and-permissions-tests.md), and
[OpenCode investigation](../plans/2026/11/12/2026-11-12-plugin-labels-installation-and-permissions-opencode.md).
