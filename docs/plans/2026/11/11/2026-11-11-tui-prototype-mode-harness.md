# TUI prototypes: harness, scenarios and knobs

**Date**: 2026-11-11
**Status**: Done
**Parent**: [`2026-11-11-tui-prototype-mode.md`](2026-11-11-tui-prototype-mode.md)
**Sibling**: [`2026-11-11-tui-prototype-mode-tests.md`](2026-11-11-tui-prototype-mode-tests.md)

Module: `src/notifyhub/tui/src/prototypes/` — `PrototypeApp.tsx`, `scenarios.ts`, `README.md`.

## Goal

Give the TUI the same copy-on-write prototype loop as the reference project's web prototypes:
render the real presentation shell against fixtures, switch scenarios with keys, and keep the
harness out of the app.

## Component map

```text
prototype.tsx
  └── PrototypeApp
        ├── PrototypeBar        (harness chrome: scenario index, keys, clock)
        ├── AppView             (real shell: waiting cards, stream, popups, footer)
        └── buildScenarios()    (fixtures: notifications, agent statuses, server info)
```

## What changed

- **`PrototypeApp.tsx`** — scenario index, `n`/`p` and `1`–`9` switching, `t` freeze/live,
  mock delete, fake pagination loading, and the harness-only `PrototypeBar`.
- **`scenarios.ts`** — seven scenarios built against one reference time:
  overview, waiting states, waiting edge cases, notification cards, e2e/locked, empty/offline,
  many/pagination.
- **`README.md`** — scenario map and harness file list.
- **`PrototypeBar`** — full legend on wide terminals; compact
  `PROTO 1/7 overview  |  n/p  |  t:live` below 60 columns.

## Design decisions

- **Render `AppView`, not a copied shell.** The harness gets the app's keyboard routing, footer,
  popup layering and flex layout for free; only the data and the bar are fake.
- **Fixtures at the data boundary.** Each scenario is plain `NotificationItem[]`,
  `AgentStatusEntry[]` and `ServerInfo`. No `fetch`, SSE, crypto or backend.
- **Scenarios, not one stacked page.** `n`/`p` and the number keys make each case a screen; the
  bar names the current case for screenshots.
- **One reference time per scenario.** Timestamps are built once so "2m ago" does not jitter
  between renders. `t` freezes the display clock and regenerates the fixtures at that moment.
- **Fake pagination shows both states.** `l` shows the real loading text, then drops `hasMore` to
  show the end-of-history footer. It does not append rows; the stream's own tests cover append.
- **Delete is local.** `handleDelete` filters the fixture list; the prototype cannot delete real
  notifications.
- **Harness chrome is separate.** `PrototypeBar` is passed through `AppView`'s `header` prop and is
  never rendered by `App`.

## Trials, errors and lessons

### The first harness tried to render `<App />`

`App` calls `useNotifications`, which opens SSE and polls the backend. The prototype needed the
presentation half without the data half; hence `AppView`.

**Lesson**: extract the data boundary before building a harness. A prototype that connects to the
real service is a test environment, not a design harness.

### The bar clipped its own legend

At 40 columns the first bar showed `PROTOTYPE 1/7 overview | n/p: scena`. The bar now reads
`useTerminalDimensions()` and switches to the compact label below 60 columns.

**Lesson**: prototype chrome is UI too; a harness that hides its own state is not helping.

### The spinner keeps animating when time is frozen

`t` freezes relative timestamps and the stale mirror, but the spinner is state-driven and keeps
ticking. That is intentional: freeze is for deterministic text and screenshots, not for stopping
the live indicator.

**Lesson**: define what "frozen time" controls. Trying to freeze the spinner would require a
different clock abstraction and would hide the running state.

### Pagination is a design demo, not a data fake

The first `many` scenario appended rows on `l`, which triggered the notification sound and made
the fixture list grow forever. The final harness shows the loading state for 700 ms, then removes
`hasMore`; the design cases are both visible without pretending to paginate a fake server.

**Lesson**: keep the harness honest about what it fakes. The real pagination merge is covered by
`NotificationStream` tests.

### Scenario count is copied into the test

The bar says `1/7`; `Prototype.test.tsx` asserts `PROTOTYPE 1/7`; the docs table lists seven cases.
Adding one scenario means updating all three.

**Lesson**: if the catalog count must be duplicated, make the test catch it. The bar is the runtime
source of truth; the docs are the human source.

## Verification

- `make tui-prototype` in tmux at 120×40: scenario 1 (two waiting cards + feed), `n` → scenario 2,
  `q` exits.
- 40×30: compact bar fits; waiting cards wrap; the app footer still clips (pre-existing).
- `make tui-test`: prototype tests pass as part of 146 tests / 11 files.
- `make tui-typecheck`: only documented baseline error classes.

## Docs updated

- `src/notifyhub/tui/src/prototypes/README.md` — scenario map.
- `docs/_meta/how-to-prototype.md` — copy-on-write guide and TUI-specific paths.
- `src/notifyhub/tui/README.md`, `docs/important/the-tui.md` — harness location and keys.
- `docs/important/tui-rendering-rules.md` — test-count floor.

## Related

- Parent: [`2026-11-11-tui-prototype-mode.md`](2026-11-11-tui-prototype-mode.md)
- Tests: [`2026-11-11-tui-prototype-mode-tests.md`](2026-11-11-tui-prototype-mode-tests.md)
- Guide: [`docs/_meta/how-to-prototype.md`](../../../../_meta/how-to-prototype.md)
