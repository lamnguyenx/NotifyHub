# TUI components: waiting-card finish and quieter feed

**Date**: 2026-11-11
**Status**: Done (154 tests pass)
**Parent**: [`2026-11-11-tui-prototype-polish.md`](2026-11-11-tui-prototype-polish.md)
**Siblings**: [`harness`](2026-11-11-tui-prototype-polish-harness.md) ·
[`tests`](2026-11-11-tui-prototype-polish-tests.md)

Module: `src/notifyhub/tui/src/components/` — `WaitingCards.tsx`, `NotificationRow.tsx`,
`README.md`.

## Goal

Make a waiting card readable at a glance: the live status belongs in the card's bottom-right
corner, the word should feel alive without spinning like a slot machine, and permission waits,
stalls and normal feed cards should each have a distinct visual weight.

## What changed

### `WaitingCards.tsx`

- **Bottom-right status** — the `@ASSISTANT` row is now a flex row: label on the left, a
  `flexGrow` spacer, then the state + spinner on the right. The status no longer floats next to
  the label.
- **One ticker** — `useSpinner` became `useTicker(active)` returning a tick. The 120 ms interval
  drives the braille spinner, the shimmer and the overall card re-render; it runs only while
  `running`.
- **Per-turn gerunds** — a 26-entry `LOADING_WORDS` list (`loading`, `pondering`, `noodling`,
  `rubber-ducking`, `grepping the void`, …). `loadingWordFor(seed)` hashes `session_id` + the
  current task excerpt; the word stays fixed for a turn and changes when a new prompt arrives.
- **Shimmer** — `LoadingWord` splits the word into `<span>`s and mixes `theme.accent` into
  `theme.text` with `mixHex`; the highlighted letter is the head, its neighbours get
  `0.45` strength. The circular distance wraps the wave from the last letter to the first.
- **Semantic state colors** — `blocked` (permission/input) stays warning/amber with `⚠`;
  `stale` is danger/red with `◼`. The border follows the same mapping.
- **State wash** — the card background is `mixHex(borderColor, theme.background, 0.1)`. This
  keeps the text/pills readable while tying the body to the state border.
- **Tighter stack** — `WaitingCards` uses `gap={0}`; cards sit border-to-border.
  `marginBottom={1}` remains between the stack and the feed.
- **Word list width** — words are kept short enough to fit beside `@ASSISTANT` at 40 columns,
  including phrases such as `consulting the void`.

### `NotificationRow.tsx`

- Plain and `LOCKED` cards use the new `theme.cardBorder` token for their unselected border.
  Selected cards still use `theme.borderSelected`; popups still use `theme.border`.
- The card background still switches between `theme.background` and `theme.surfaceSelected`.

## Design decisions

- **One word per turn, not a carousel.** Claude Code picks a whimsical gerund per turn. A timer
  rotation made the prototype feel noisy. Hashing the task excerpt gives the same stability and
  a natural trigger: a new message changes the excerpt.
- **Hash the task, not `updated`.** `updated` changes on every status refresh, so it would rotate
  the word continuously. The task excerpt is stable during a turn and changes on a new prompt.
- **Avalanche the hash.** The first FNV result mapped two different prototype sessions to the same
  gerund. A short finalizer spreads the low bits before the modulo.
- **Tint at 10%.** Higher ratios turned the card into a colored slab; 10% is visible in the
  terminal spans but does not fight the text. Mixing into the theme background works in both
  light and dark modes.
- **`gap={0}` for docked cards.** The border already separates the cards; a blank row between
  every waiting card was wasted vertical space.
- **`cardBorder` is separate from `border`.** The feed should recede; popup chrome should stay
  prominent. Sharing one token would have made popups gray too.

## Trials, errors and lessons

### The carousel was too fast

The first animation rotated the word every ~1.9s. It read like a slot machine and did not match
Claude Code. The fix was to seed the word from the turn instead of the tick.

**Lesson**: "animate the text" does not automatically mean "rotate the text". A stable word with
a moving highlight is calmer and easier to read.

### Two intervals would have doubled the per-card work

Adding a separate shimmer timer would have re-rendered every waiting card on two independent
schedules. The ticker was refactored to return a monotonic tick; the spinner frame, shimmer head
and word selection derive from it.

**Lesson**: when several animations share a cadence, derive them from one tick. Keep the tick
local to the card so one card's animation does not re-render the list.

### The first hash produced visible duplicates

With plain FNV-1a, two overview fixtures (`ses_proto_running` and `ses_proto_blocked`) both landed
on `debugging`. The words were different in intent but identical on screen.

**Lesson**: when hashing into a small list, add an avalanche step and check the actual fixture
pairs. A hash can be "correct" and still look broken to a human.

### `blocked` and `stale` were both amber

Both states used `theme.warning`, so "please approve this" and "this agent may be dead" looked
like the same problem. `blocked` now stays warning/amber; `stale` uses danger/red.

**Lesson**: color is a semantic channel. If two states need different actions, they need different
colors and markers, even if both are "warning-ish".

### The normal-card gray overshot

The first `cardBorder` was `#555555`; the user's reaction was "too gray :v". The final values are
`#808080` (dark) and `#c0c0c0` (light).

**Lesson**: "grayer" is relative to the old white. Start with a mid-light gray, preview both
themes, and keep the token isolated so it is a one-line adjustment.

### Tinting the card body can look like a different card

The wash must be subtle enough that it is felt, not read as a state block. `0.1` keeps the
background near the theme background while the border remains the strong signal.

**Lesson**: mix state color into the card background at low strength, not as a saturated fill.
Use `mixHex` so light and dark themes share the same rule.

### `gap={1}` cost a row per card pair

Three docked cards spent two rows on empty gaps. Removing the gap and letting rounded borders
touch reclaimed those rows for the feed.

**Lesson**: in a terminal, use the card's own border as separation before spending a row on
spacing.

## Verification

- `WaitingCards.test.tsx` covers the right-aligned status, per-message word stability, the
  shimmer span colors, blocked/stale colors and the tinted backgrounds.
- `NotificationRow.test.tsx` checks the gray normal border and accent selected border.
- `layout.test.tsx` uses `loadingWordFor("s1:task-1")`, so the card's row still asserts the
  actual seeded word.
- tmux captures confirmed `waiting for you ⚠` `#ffcc00`, `stalled? ◼` `#ff5555`, card washes
  `#0b1416`/`#1a1400`/`#1a0909`, and the normal card border `#808080`.
- `make tui-test` — **154 pass, 0 fail, 243 expect calls, 11 files**.

## Related

- Parent: [`2026-11-11-tui-prototype-polish.md`](2026-11-11-tui-prototype-polish.md)
- Tests: [`2026-11-11-tui-prototype-polish-tests.md`](2026-11-11-tui-prototype-polish-tests.md)
- Waiting-card parent: [`2026-11-11-tui-waiting-cards.md`](2026-11-11-tui-waiting-cards.md)
- Component guide: [`src/notifyhub/tui/src/components/README.md`](../../../../../src/notifyhub/tui/src/components/README.md)
- Rendering rules: [`docs/important/tui-rendering-rules.md`](../../../../../docs/important/tui-rendering-rules.md)
