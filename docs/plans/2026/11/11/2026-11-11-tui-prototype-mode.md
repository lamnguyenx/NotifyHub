# TUI: mock-data prototype mode

**Date**: 2026-11-11
**Status**: Done (146 TUI tests pass)
**Modules**: `src/notifyhub/tui/src/prototype.tsx`, `src/notifyhub/tui/src/prototypes/`,
`src/notifyhub/tui/src/App.tsx`, `src/notifyhub/tui/src/render.tsx`,
`src/notifyhub/tui/src/components/NotificationStream.tsx`

## Module map

| Module | Plan |
|---|---|
| `src/notifyhub/tui/` (entry, `AppView`, boot, docs) | this doc |
| `src/notifyhub/tui/src/prototypes/` (harness, scenarios) | [`2026-11-11-tui-prototype-mode-harness.md`](2026-11-11-tui-prototype-mode-harness.md) |
| `src/notifyhub/tui/src/__tests__/` (prototype tests) | [`2026-11-11-tui-prototype-mode-tests.md`](2026-11-11-tui-prototype-mode-tests.md) |

## Goal

Add `make tui-prototype`: run the real TUI against fake data so every card, waiting state, popup
and overflow case can be inspected without a backend, SSE stream, e2e key or agent session.

The other project's
[`docs/_meta/how-to-prototype.md`](../../../../../../hanoi-testing-platform/docs/_meta/how-to-prototype.md)
describes copy-on-write prototypes: import the real app, copy a file only as a temporary seam, and
write the prototype back when the design lands. This task applies that method to the TUI and
drafts the same guide at [`docs/_meta/how-to-prototype.md`](../../../../_meta/how-to-prototype.md).

## What changed

### One presentation shell: `AppView`

`App.tsx` now exports `AppView`, the real layout/keyboard/popup shell, and `App`, which wires the
live `useNotifications` store into it. The prototype renders `AppView` directly with fixtures.

`AppView` gained three optional props that are hooks (no app behaviour when unset):

- `now?: Date` — a frozen clock for the scenario; the app keeps the live clock.
- `header?: ReactNode` — harness chrome above the waiting cards; the app passes none.
- `footerExtra?: string` — extra footer hint; the app passes none.

`NotificationStream` gained the matching optional `now?: Date` so its card timestamps freeze with
the harness clock. It still calls `useNow()` unconditionally and lets the prop win.

### Shared boot

`render.tsx` owns `createCliRenderer`, the theme-mode probe, the `ThemeProvider` and the
`onDestroy` exit. `index.tsx` and `prototype.tsx` both call `renderTui(<... />)`, so the prototype
cannot drift from the app's renderer setup.

### Harness and scenarios

- `prototype.tsx` → `<PrototypeApp />`.
- `prototypes/PrototypeApp.tsx` — scenario index, `n`/`p` and `1`–`7` switching, `t` freeze/live,
  mock delete, fake pagination loading, and the harness-only `PrototypeBar`.
- `prototypes/scenarios.ts` — seven scenarios: overview, waiting states, waiting edge cases,
  notification cards, e2e/locked, empty/offline, many/pagination.
- Fake data enters at `AppViewProps`: `NotificationItem[]`, `AgentStatusEntry[]`, `ServerInfo`.
  No `fetch`, SSE, crypto or backend.

## Design decisions

- **`AppView`, not a copied shell.** Duplicating the 30-line app shell would let keyboard routing,
  footer hints and popup layering drift. Extracting the shell keeps one implementation and lets
  the prototype use the real components.
- **Fixtures at the data boundary.** The fake data is exactly the shape `useNotifications` returns,
  so cards render through the same paths as production. A mock inside `NotificationRow` would test
  a different component.
- **One scenario per case, switchable with keys.** Stacking every case on one screen makes
  comparison a scroll. The bar names the current scenario so a screenshot is self-describing.
- **`t` freezes time.** Relative timestamps and the 5-minute stale mirror need a static mode for
  screenshots; the spinner still animates because it is state-driven. Scenario timestamps are
  built against a reference time so "2m ago" is stable.
- **Prototype chrome lives in the harness.** `PrototypeBar` is not passed by `App` and never
  appears in the app. This is the TUI analogue of the reference guide's `proto-*` page chrome.
- **Pagination is a loading-state demo.** `l` shows the real loading text for 700 ms but does not
  append fake rows. The scenario is for inspecting the design; scrolling behavior is already
  covered by `NotificationStream` tests.
- **No backend.** The prototype cannot accidentally push deletes: `handleDelete` removes the row
  from the fixture list only.

## Trials, errors and lessons

### The app hook would have connected SSE

Rendering `<App />` with mock data is not possible — `App` calls `useNotifications`, which opens
SSE and fetches. The prototype needed the presentation half separated from the data half.

**Lesson**: a prototype harness is easiest when the data boundary is already an explicit prop
boundary. Extract it before the next experiment, not during it.

### A header outside `AppView` would overflow

The first idea was `<box column><PrototypeBar /><AppView /></box>`, but `AppView`'s root is
`height="100%"`; it would take the full terminal height and push the bar/footer off-screen. The
header prop is rendered inside the root column, above the flexGrow feed.

**Lesson**: decide where the harness chrome lives before adding it. A prop inside the shell avoids
a second layout model.

### Key names for digits

`useKeyboard()` reports `key.name` as the character; `1`–`7` work directly. Letter keys `n`/`p`
were chosen over `[`/`]` because bracket names differ across terminals.

**Lesson**: test the actual keypath in `testRender`; do not assume a punctuation key's `name`.

### The prototype bar clipped before the app did

The first bar printed the full legend at every width and truncated at 40 columns
(`PROTOTYPE 1/7 overview | n/p: scena`). The harness now reads `useTerminalDimensions()` and uses a
compact label below 60 columns: `PROTO 1/7 overview | n/p | t:live`.

**Lesson**: harness chrome is UI too. A prototype that clips its own controls hides the state it
is meant to show; test the bar at the same narrow widths as the app.

### The scenario count is duplicated

The bar prints `1/7` and `Prototype.test.tsx` asserts `PROTOTYPE 1/7`. Adding a scenario requires
updating both, the docs table and the README.

**Lesson**: when a harness has a catalog, put the count in one place or accept the documented
update. The test makes the duplication visible.

### Spinner timers still produce act warnings

`useSpinner` updates every 120 ms, so `Prototype.test.tsx` logs the same React `act(...)` warnings
as the waiting-card tests. Assertions pass.

**Lesson**: known caveat; do not remove the spinner to quiet the warning.

### Typecheck noise is still the baseline

`make tui-typecheck` reports the documented missing `bun:test`/Node declarations and
`CliRenderer.on/off` errors. The new files add only the existing `process` missing-types class.

**Lesson**: compare against `HEAD`; the suite is the reliable gate.

## Verification

- `make tui-test`: **146 pass, 0 fail, 218 expect calls, 11 files**.
- `make tui-typecheck`: only the documented pre-existing error classes.
- Real run in tmux at 120×40: `make tui-prototype` drew scenario 1 (two waiting cards + feed),
  `n` switched to scenario 2, `q` exited.
- 40-column run: the bar switches to its compact form (`PROTO 1/7 overview  |  n/p  |  t:live`),
  waiting cards wrap by Yoga, and the feed keeps the remaining height. The app footer still clips
  at 40 columns (pre-existing app layout, not harness chrome).
- `git diff --check`: clean.

## Docs updated

- New `docs/_meta/how-to-prototype.md` — copy-on-write guide adapted to this TUI.
- New `src/notifyhub/tui/src/prototypes/README.md` — scenario map and harness files.
- Root `README.md` §16, `src/notifyhub/tui/README.md`, `docs/important/the-tui.md` — command,
  keys and links.
- `docs/important/tui-rendering-rules.md` — test-count floor.
- `src/notifyhub/tui/src/__tests__/README.md` — suite list, count and links.
- Module plans: [harness](2026-11-11-tui-prototype-mode-harness.md),
  [tests](2026-11-11-tui-prototype-mode-tests.md).

## Related

- Guide: [`docs/_meta/how-to-prototype.md`](../../../../_meta/how-to-prototype.md)
- Reference project guide:
  [`hanoi-testing-platform/docs/_meta/how-to-prototype.md`](../../../../../../hanoi-testing-platform/docs/_meta/how-to-prototype.md)
- App shell: `src/notifyhub/tui/src/App.tsx`
- Scenarios: `src/notifyhub/tui/src/prototypes/scenarios.ts`
- Tests: `src/notifyhub/tui/src/__tests__/Prototype.test.tsx`
