# TUI Prototypes

`make tui-prototype` runs the real `AppView` and components against fake data. It never connects
to the backend. The target runs `bun --watch`, so a source edit restarts the harness automatically
(scenario/frozen-clock state resets; use `bun src/prototype.tsx` for a one-shot run).

- `PrototypeApp.tsx` — harness: scenario switcher, frozen clock, prototype bar, `r` restart.
  Restarting resets to scenario 1, live time, no deletions/pending loads, and remounts `AppView`
  so popups/selection/scroll are fresh.
- `scenarios.ts` — one `PrototypeScenario` per case (waiting cards, feed variants, e2e, empty,
  many).
- Add a scenario in `buildScenarios()`, then update the `PROTOTYPE 1/7` expectation in
  `../__tests__/Prototype.test.tsx` if the count changed.
- Keys: `1`–`7` jump, `n`/`p` cycle, `t` freeze time, `r` restart (fresh launch),
  `v` select mode, `s` status, `h`/`?` help, `q` quit.
- Copy-on-write rules: `docs/_meta/how-to-prototype.md`.
- Plans: [`prototype mode`](../../../../../docs/plans/2026/11/11/2026-11-11-tui-prototype-mode.md),
  [`harness`](../../../../../docs/plans/2026/11/11/2026-11-11-tui-prototype-mode-harness.md),
  [`tests`](../../../../../docs/plans/2026/11/11/2026-11-11-tui-prototype-mode-tests.md),
  [`prototype polish — parent`](../../../../../docs/plans/2026/11/11/2026-11-11-tui-prototype-polish.md),
  [`polish — harness`](../../../../../docs/plans/2026/11/11/2026-11-11-tui-prototype-polish-harness.md),
  [`polish — tests`](../../../../../docs/plans/2026/11/11/2026-11-11-tui-prototype-polish-tests.md).

Scenarios:

| Key | Scenario | Covers |
|---|---|---|
| `1` | overview | forever-loading, blocked and stalled cards + mixed feed |
| `2` | waiting states | running, blocked, stalled |
| `3` | waiting edge cases | no task, no host, unknown agent |
| `4` | notification cards | tags, truncation, empty body, long pwd |
| `5` | e2e / locked rows | envelopes, locked count, e2e popup |
| `6` | empty / offline | empty feed, disconnected server |
| `7` | many / pagination | 30 cards, `l` loading state |

Running fixtures carry a far-future `updated` (and a per-turn gerund seeded from the task excerpt),
so the loading examples stay `loading` for as long as the prototype runs. The stalled case
overrides `updated` with an old timestamp to trigger the client-side 5-minute stale mirror.
`Prototype.test.tsx` covers the overview, scenario switching, frozen clock, `r` restart and both
timing fixtures.
