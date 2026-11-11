# TUI tests: prototype harness

**Date**: 2026-11-11
**Status**: Done
**Parent**: [`2026-11-11-tui-prototype-mode.md`](2026-11-11-tui-prototype-mode.md)
**Sibling**: [`2026-11-11-tui-prototype-mode-harness.md`](2026-11-11-tui-prototype-mode-harness.md)

Module: `src/notifyhub/tui/src/__tests__/` — new `Prototype.test.tsx`; updated `README.md`.

## What changed

`Prototype.test.tsx` (3 tests) renders `PrototypeApp` directly at 100×36:

1. **Overview** — `PROTOTYPE 1/7`, `◇ opencode`, `@USER`, `waiting for you`.
2. **Scenario switching** — `n` → `2/7`, `n` → `3/7` and `cursor`, then `5` → `5/7` and `LOCKED`.
3. **Frozen clock** — `t` → `time frozen`, second `t` → `time live`.

No `globalThis.fetch` mock is needed because `PrototypeApp` never calls `useNotifications`.

## Design decisions

- **Test the harness, not each scenario's pixels.** Scenario fixtures are content; the test proves
  the harness wiring, key handling and real `AppView` composition.
- **Use the real key names.** `n` and `p` are letters; `1`–`7` are characters whose `key.name` is
  the digit. The test presses `5` rather than reaching into state.
- **Keep one representative visual assertion.** The overview card test checks both the project and
  the agent label so a broken `AppView` import fails loudly.
- **No backend mock.** If someone later adds `fetch` to `PrototypeApp`, this test starts hitting
  the network and fails; that is the intended guard.

## Trials, errors and lessons

### No fetch mock was a feature

The existing `App.test.tsx` mocks `globalThis.fetch` because `App` opens SSE. The prototype test
does not, which proves the harness stays behind the `AppView` boundary.

**Lesson**: test the absence of a dependency by not mocking it. If the harness grows a network
call, the test should notice.

### Digit keys are characters

`Key.name` for `5` is `"5"`, so `/^[1-9]$/` is the right guard. Bracket keys were rejected for the
harness because their names vary across terminal protocols.

**Lesson**: verify key names with `testRender().mockInput`, not with assumptions from web
keyboards.

### The count is asserted twice

The test expects `PROTOTYPE 1/7`; the bar builds that string from `scenarios.length`. Adding an
eighth scenario fails the test until the expectation and docs are updated.

**Lesson**: a visible count is a cheap regression test for catalog drift, as long as the update
path is documented.

### Spinner timers still warn

The overview has running/blocked waiting cards, so the 120 ms spinner logs React `act(...)`
warnings. The test still passes.

**Lesson**: the warning is a known caveat shared with `WaitingCards.test.tsx`; do not remove the
spinner to silence it.

### The prototype tests add the existing typecheck class

`Prototype.test.tsx` reports `Cannot find module 'bun:test'` like every other test file. That is the
documented baseline, not a regression.

**Lesson**: compare typecheck against `HEAD`; the suite is the real gate.

## Verification

- `make tui-test`: **146 pass, 0 fail, 218 expect calls, 11 files**.
- `bun test src/__tests__/Prototype.test.tsx`: 3 pass, 11 expects.
- Real tmux run at 120×40 and 40×30 confirms the same scenarios render outside the test renderer.
- `make tui-typecheck`: only documented baseline classes.

## Docs updated

- `src/notifyhub/tui/src/__tests__/README.md` — suite list, count, links.
- `docs/important/tui-testing-guide.md` — "Testing the prototype harness" section.
- `docs/important/tui-rendering-rules.md` — test-count floor.

## Related

- Parent: [`2026-11-11-tui-prototype-mode.md`](2026-11-11-tui-prototype-mode.md)
- Harness: [`2026-11-11-tui-prototype-mode-harness.md`](2026-11-11-tui-prototype-mode-harness.md)
- Guide: [`docs/_meta/how-to-prototype.md`](../../../../_meta/how-to-prototype.md)
