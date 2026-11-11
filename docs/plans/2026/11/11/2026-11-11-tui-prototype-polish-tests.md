# TUI tests: prototype polish, waiting-card states and borders

**Date**: 2026-11-11
**Status**: Done (154 tests pass)
**Parent**: [`2026-11-11-tui-prototype-polish.md`](2026-11-11-tui-prototype-polish.md)
**Siblings**: [`components`](2026-11-11-tui-prototype-polish-components.md) ·
[`harness`](2026-11-11-tui-prototype-polish-harness.md)

Module: `src/notifyhub/tui/src/__tests__/` — `WaitingCards.test.tsx`, `Prototype.test.tsx`,
`NotificationRow.test.tsx`, `layout.test.tsx`, `README.md`.

## What changed

### `WaitingCards.test.tsx`

Added or updated coverage for:

- the `@ASSISTANT` status and spinner snapped to the card's bottom-right corner;
- one stable gerund per message (`loadingWordFor`) and a different word for a different task;
- the shimmer's per-letter color wave via `captureSpans()` + `rgbToHex()`;
- blocked (`waiting for you`) as warning/amber and stale (`stalled?`) as danger/red;
- the state-colored card background at 10% of the border color;
- the existing full-card, host-pill, edge-case and idle-hiding assertions.

The old assertions that a frame literally contains `loading` were replaced with
`loadingWordFor("…")` because the word is now seeded per turn.

### `Prototype.test.tsx`

- The overview now asserts `stalled?` alongside the running and permission states.
- A pure fixture test checks that `ses_proto_running` has a far-future `updated` and
  `ses_proto_stalled` is older than five minutes.
- `r` restarts from a frozen scenario 2 back to scenario 1 with the live clock.

### `NotificationRow.test.tsx`

- Normal cards render `DARK_THEME.cardBorder` (`#808080`).
- Selected cards still render `DARK_THEME.borderSelected`.
- The existing host-model/tag/avatar/truncation tests are unchanged.

### `layout.test.tsx`

- The waiting-card row still asserts `@ASSISTANT`, but the expected word now comes from
  `loadingWordFor("s1:task-1")` instead of the old literal `loading`.

## Counts

| Metric | Before | After |
|---|---|---|
| Tests | 146 | **154** |
| Files | 11 | **11** |
| Expect calls | 218 | **243** |

## Trials, errors and lessons

### The literal `loading` assertion became a lie

Once the word was seeded per turn, a test that expected `loading` failed for most fixtures. The
fix was not to force the first word back to `loading`; it was to export the pure
`loadingWordFor(seed)` helper and assert the word the component should actually render.

**Lesson**: when a test hardcodes presentation text that becomes dynamic, derive the expected
value from the same pure function the component uses. Do not weaken the assertion to "some
word".

### The shimmer regex was too narrow

The first shimmer test filtered spans with `/^[loading]+$/`, which only matched letters in the
word `loading`. Once other gerunds appeared, the test could pass on an empty set. It now filters
`/^[a-z -]+$/` and ignores whitespace-only spans.

**Lesson**: color tests must prove they found the target spans. A filter that matches nothing can
turn a color assertion into a vacuous pass.

### `captureSpans()` shows inherited card backgrounds

The tinted background is applied to the outer card box, not to every text node. The span capture
still reports the background on the text spans, so the test can assert
`mixHex(border, background, 0.1)` directly.

**Lesson**: assert the rendered span background rather than the component prop. It proves the
inheritance actually reached the terminal cells.

### The `useTicker` rename changed the act-warning story

`useSpinner` is now `useTicker`; the 120 ms interval still updates state and still logs React
`act(...)` warnings. The warnings remain a known caveat, not a failure. One ticker replaced the
old spinner-only interval, so no extra timer was introduced.

**Lesson**: keep the documented act-warning caveat tied to the ticker name; future readers will
grep for the old hook and wonder why the warning persists.

### Test counts live in several docs

The suite moved from 146 to 154, with the same 11 files. Counts and "146+" floors appeared in the
TUI README, `__tests__/README.md`, the testing guide and the rendering rules. They were swept in
the same pass.

**Lesson**: when the suite size changes, grep for the old number and for its "+" form. Historical
plan docs keep their session counts; current guides get the new one.

### The `r` test needs a rendered state, not just a key press

Pressing `r` immediately after `n` would pass even if `r` only reset the scenario index. The test
first freezes the clock (`t`), then restarts, and asserts both `PROTOTYPE 1/7` and `time live`.
That covers harness reset and the remount path.

**Lesson**: assert two independent pieces of state after a restart. A single "back to 1/7" check
can hide a clock, deletion or popup leak.

## Verification

- `make tui-test` — **154 pass, 0 fail, 243 expect calls, 11 files**.
- `make tui-typecheck` — only the documented pre-existing error classes.
- tmux spot checks: loading word stable + spinner advancing, amber/red status colors, tinted
  waiting cards, gray normal border, `r` reset from a frozen scenario with Help open.

## Related

- Parent: [`2026-11-11-tui-prototype-polish.md`](2026-11-11-tui-prototype-polish.md)
- Components: [`2026-11-11-tui-prototype-polish-components.md`](2026-11-11-tui-prototype-polish-components.md)
- Harness: [`2026-11-11-tui-prototype-polish-harness.md`](2026-11-11-tui-prototype-polish-harness.md)
- Test README: [`src/notifyhub/tui/src/__tests__/README.md`](../../../../../src/notifyhub/tui/src/__tests__/README.md)
- Testing guide: [`docs/important/tui-testing-guide.md`](../../../../../docs/important/tui-testing-guide.md)
- Previous waiting-card tests: [`2026-11-11-tui-waiting-cards-tests.md`](2026-11-11-tui-waiting-cards-tests.md)
