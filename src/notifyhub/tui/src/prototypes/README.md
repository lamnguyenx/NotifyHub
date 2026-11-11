# TUI Prototypes

`make tui-prototype` runs the real `AppView` and components against fake data. It never connects
to the backend.

- `PrototypeApp.tsx` — harness: scenario switcher, frozen clock, prototype bar.
- `scenarios.ts` — one `PrototypeScenario` per case (waiting cards, feed variants, e2e, empty,
  many).
- Add a scenario in `buildScenarios()`, then update the `PROTOTYPE 1/7` expectation in
  `../__tests__/Prototype.test.tsx` if the count changed.
- Keys: `1`–`7` jump, `n`/`p` cycle, `t` freeze time, `v` select mode, `s` status, `h`/`?` help,
  `q` quit.
- Copy-on-write rules: `docs/_meta/how-to-prototype.md`.
- Plans: [`prototype mode`](../../../../../docs/plans/2026/11/11/2026-11-11-tui-prototype-mode.md),
  [`harness`](../../../../../docs/plans/2026/11/11/2026-11-11-tui-prototype-mode-harness.md),
  [`tests`](../../../../../docs/plans/2026/11/11/2026-11-11-tui-prototype-mode-tests.md).

Scenarios:

| Key | Scenario | Covers |
|---|---|---|
| `1` | overview | waiting cards + mixed feed |
| `2` | waiting states | running, blocked, stalled |
| `3` | waiting edge cases | no task, no host, unknown agent |
| `4` | notification cards | tags, truncation, empty body, long pwd |
| `5` | e2e / locked rows | envelopes, locked count, e2e popup |
| `6` | empty / offline | empty feed, disconnected server |
| `7` | many / pagination | 30 cards, `l` loading state |
