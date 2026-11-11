# TUI prototype harness: watch mode, restart, stable fixtures

**Date**: 2026-11-11
**Status**: Done (154 tests pass)
**Parent**: [`2026-11-11-tui-prototype-polish.md`](2026-11-11-tui-prototype-polish.md)
**Siblings**: [`components`](2026-11-11-tui-prototype-polish-components.md) ·
[`tests`](2026-11-11-tui-prototype-polish-tests.md)

Module: `src/notifyhub/tui/src/prototypes/` — `PrototypeApp.tsx`, `scenarios.ts`, `README.md`;
plus the `make tui-prototype` and `package.json` scripts in the parent module.

## Goal

Make the prototype useful as a continuous design loop:

- save a file and see the result without leaving the terminal;
- reset the demo state on demand with `r`;
- keep the loading examples loading forever;
- add a stalled-session example so blocked and dead states can be compared side by side.

## What changed

### Watch by default

- `Makefile` `tui-prototype` / `tp` now runs `bun --watch src/prototype.tsx`.
- `package.json` `prototype` watches; `prototype:once` runs the old one-shot command.
- The harness README and `docs/_meta/how-to-prototype.md` explain that a save restarts the
  process and resets scenario/frozen-clock state.

### `r` restart

`PrototypeApp` gained a `restart` callback and a `restartKey`:

```tsx
const restart = useCallback(() => {
  clearLoadTimer()
  setScenarioIdx(0)
  setReferenceNow(new Date())
  setFrozenAt(null)
  setDeleted([])
  setLoadingMore(false)
  setHasMoreOverride(null)
  setRestartKey((key) => key + 1)
}, [clearLoadTimer])
```

- `r` calls it before the scenario keys.
- `<AppView key={restartKey} … />` remounts the view.
- `footerExtra="r:restart"` advertises the key.
- Result: scenario 1, live clock, no deletions, no pending page load, closed popups, reset
  selection and scroll.

### Fixtures

- `FOREVER = new Date(8.64e15).toISOString()` is a far-future `updated` timestamp.
- `status()` defaults `updated` to `FOREVER` for `running` entries. A prototype loading card
  therefore never trips the client-side 5-minute stale mirror.
- A scenario that wants a stall overrides `updated` with an old timestamp; the overview now has a
  codex `ses_proto_stalled` card in addition to the running and blocked cards.
- The overview blurb is now "loading, blocked and stalled cards above a mixed feed".
- The scenario count stays at seven.

## Design decisions

- **Watch mode, not hot mode.** Bun `--hot` cannot keep a React/OpenTUI root alive across module
  re-evaluation. This was tested in the parent plan; watch mode's hard restart is reliable.
- **`r` is a remount, not a process relaunch.** Watch mode already handles code changes. `r` is
  for resetting demo state. A process relaunch would need a supervisor loop or watcher touch and
  is not worth the complexity.
- **Far-future fixture instead of a component flag.** The production stale mirror must stay
  exactly as it is. Changing a fixture's `updated` keeps the prototype honest without adding a
  prototype-only branch to `WaitingCards`.
- **Explicit stall fixture.** The existing "waiting states" scenario already had a stalled entry;
  adding one to the overview makes the primary design page show running, blocked and stalled
  together.

## Trials, errors and lessons

### Watch restart and state reset are different features

`bun --watch` fixed the edit loop but resets the selected scenario and frozen clock on every save.
That is fine for code reload, but while comparing two scenarios it is disruptive. `r` gives a
deliberate reset without relying on the watcher.

**Lesson**: a reload loop needs both code refresh and a manual state reset. Do not overload one
key or the watcher with both jobs.

### `bun --hot` crashed the prototype

Trying to reuse the renderer/root on `globalThis` produced
`TypeError: null is not an object (evaluating 'resolveDispatcher().useState')` after a scenario
edit. The process was left on a blank screen. The experiment was reverted; `--watch` stayed.

**Lesson**: test hot-reload claims in the real terminal. Bun's `--hot` is a server-side soft
reload, not React Fast Refresh.

### Forever-loading needs a clock trick, not a UI flag

A running fixture with `updated: now` goes stale after five minutes of looking at the prototype.
Setting `updated` far in the future keeps the loading card on `loading` forever. The intentional
stall case still overrides the value with a 10-minute-old timestamp.

**Lesson**: fixtures can pin a time-derived state without changing production behavior. Add the
exception at the data boundary, not in the component.

### `r` needed a real remount key

Resetting the harness state alone did not close popups and scroll/selection inside `AppView`.
Adding `key={restartKey}` remounts the whole view, so temporary UI state is cleared too.

**Lesson**: when a "restart" should feel fresh, reset both the harness state and the child view's
local state. A key change is the cleanest way to remount a React subtree.

### Scenario count assumptions stayed stable

Adding a stalled card to the overview did not add a scenario; the `PROTOTYPE 1/7` assertions and
the scenario table remain valid. The number keys and `n`/`p` cycle are unchanged.

**Lesson**: add cases to existing scenarios before adding screens. A new screen multiplies the
test and docs updates.

## Verification

- `make tui-prototype` in tmux:
  - editing `scenarios.ts` restarted the harness;
  - `n` → `2/7`, `t` → `time frozen`, Help open, then `r` → `1/7`, `time live`, Help closed;
  - the overview running word stayed fixed while the spinner advanced;
  - the stalled codex card rendered `stalled? ◼`.
- `Prototype.test.tsx` covers the overview stall, the far-future running fixture and `r`.
- `make tui-test` — **154 pass, 0 fail, 243 expect calls, 11 files**.

## Related

- Parent: [`2026-11-11-tui-prototype-polish.md`](2026-11-11-tui-prototype-polish.md)
- Components: [`2026-11-11-tui-prototype-polish-components.md`](2026-11-11-tui-prototype-polish-components.md)
- Tests: [`2026-11-11-tui-prototype-polish-tests.md`](2026-11-11-tui-prototype-polish-tests.md)
- Prototype harness history: [`2026-11-11-tui-prototype-mode-harness.md`](2026-11-11-tui-prototype-mode-harness.md)
- Harness README: [`src/notifyhub/tui/src/prototypes/README.md`](../../../../../src/notifyhub/tui/src/prototypes/README.md)
- Prototype rules: [`docs/_meta/how-to-prototype.md`](../../../../../docs/_meta/how-to-prototype.md)
