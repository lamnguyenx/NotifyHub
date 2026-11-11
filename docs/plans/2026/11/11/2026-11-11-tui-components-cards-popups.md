# TUI components: card measurement, popup sizing and select-mode scrolling

**Date**: 2026-11-11
**Status**: Done (139 tests pass; verified live)
**Parent**: [`2026-11-11-tui-render-popup-lifecycle.md`](2026-11-11-tui-render-popup-lifecycle.md)

Module: `src/notifyhub/tui/src/components/` — `NotificationRow.tsx`,
`NotificationStream.tsx`, `HelpPopup.tsx`, `StatusPopup.tsx`.

## What changed

### `NotificationRow.tsx` — cards that measure themselves

- **Hook-free dispatcher.** `NotificationRow` now only chooses between
  `LockedNotificationRow` and `PlainNotificationRow`. The old implementation called
  `useTerminalDimensions()` and returned the locked branch before the hooks ran, so a row that
  switched between locked and plain changed the hook order. The dispatcher has no hooks at all.
- **No guessed height.** Removed `cardHeight = 4 + wrappedEstimate + (hostModel ? 1 : 0)` and the
  `useTerminalDimensions()` dependency. The card is now `flexShrink={0}` with no `height`, so Yoga
  measures the wrapped message, the optional pwd row and the header. This also stops a resize
  from leaving blank padding or clipping text.
- **Trailing blank lines dropped.** `msg.replace(/\s+$/, "").split("\n")` keeps a message that
  ends with `\n` from adding an empty row. An empty message still renders `\u00a0` so the card
  keeps a body row.
- **Optional pwd row.** `{pwd && <text …>}` avoids an empty text line when `pwd` is missing.
- **Single-line fields.** The title uses `wrapMode="none"` inside the `overflow="hidden"` header
  row; the pwd row also uses `wrapMode="none"`. This keeps a long title or path from adding an
  unintended row and changing the measured height.
- **Truncation markers.** The plugins emit `[#truncated:+24 LINES]` and
  `[#truncated:+517 CHARS]` (see `plugins/*/notifyhub-*`). `parseMessage()` strips the
  `[#truncated:…]` wrapper; `renderSegments()` now:

  - lowercases the label (`+24 lines`),
  - collapses adjacent markers into one note,
  - brackets the note and appends a trailing space,
  - inserts a leading space only when the preceding text does not already end in whitespace,
  - removes the following text's leading space so the result is not double-spaced.
- **Locked cards.** `LockedNotificationRow` receives the `now` prop, so its timestamp ticks with
  the rest of the feed instead of freezing at render time. Its fixed `height={4}` became
  `flexShrink={0}`; the old value did not account for the border plus three content rows.
- **Stable renderable id.** Cards accept an optional `id` (used by the stream for
  `scrollChildIntoView`).
- **Stable segment keys.** The key no longer includes `seg.text.slice(0, 8)`, so changing text does
  not force a new key; the index is enough because segments are rendered in order.

### `NotificationStream.tsx` — pinned banner, selection in view

- **Select banner is a sibling, not a scroll child.** In the old layout the banner was the first
  child of the scrollbox, so it scrolled away. The component now returns a fragment:
  `<box …flexShrink={0}>` (banner) followed by the scrollbox. The scrollbox keeps
  `flexGrow={1}` + `minHeight={0}`, so `App`'s column still gives it the remaining space.
- **Scroll-to-selection.** Each card gets `id={"notification-row-" + n.id}`. A `useEffect` on
  `selectedId` calls `scrollRef.current?.scrollChildIntoView(...)` inside `setTimeout(0)` so the
  newly selected card has been laid out first; the timeout is cleared on cleanup.
- **Delete handler is pure.** The old code called `onDelete()` inside a `setSelectedIdx(prev =>
  …)` updater. Updaters must be pure (React can call them twice, and StrictMode does). The handler
  now reads the current `selectedIdx`, calls `onDelete`, then clamps the index.
- **Empty state padding.** The "Waiting for notifications…" row gets `paddingX={1}` to match the
  cards; the load-older row is `flexShrink={0}`.

### `HelpPopup.tsx` and `StatusPopup.tsx` — sized to their content

- **Help** is `Math.min(width - 2, 60)` wide and **18** rows tall: 14 content rows + 2 padding +
  2 border. It used to be 15 rows tall, so Yoga squeezed rows onto each other.
- **Status** width is `Math.min(width - 2, Math.max(46, address.length + 22))` and height **17**:
  7 content rows + 6 gaps (`gap={1}`) + 2 padding + 2 border. It used to be 38×13, which was too
  narrow for `nuc.tail0ec64c.ts.net:443` and too short for seven rows plus gaps.
- **`zIndex={100}`** on both absolute popups makes the stacking explicit; the stream and dock
  otherwise paint in the same plane.
- **Escapes moved into expressions.** `{"NotifyHub \u2014 Help"}`, `{"  j/k / \u2191\u2193 …"}`,
  and `{"  \u2191\u2193/\u2190\u2192  Scroll feed"}` render as `—`, `↑↓`, and `←→` instead of
  the literal escape text. The select-mode banner and "Waiting…" line had the same class of bug;
  they now use string expressions too.
- **Address computed once.** Status builds the address string (`host + ":" + port`) and uses it
  both for the measured width and the rendered line, so the two cannot disagree.

## Trials, errors and lessons

### A hook after an early return crashes only when the branch changes

The locked/plain switch looked harmless because notification keys are stable and most rows never
switch. It is still a Rules of Hooks violation: the first render of a plain row calls
`useTerminalDimensions`/`useTheme`; a later locked render returns before them.

**Lesson**: make the branch itself a component. A dispatcher with no hooks is the cheapest fix and
keeps both branches independently testable.

### Fixed card heights are estimates that rot

The width-based height estimate did not match the renderer's wrapping (Unicode width, `wrapMode`,
the pwd row, the host-model row). The mismatch showed up as blank lines or clipped text — worst
after a resize, when the width used for the estimate changed but the already-laid-out card did
not.

**Lesson**: let the layout engine measure content. `flexShrink={0}` is the important part inside a
scrollbox; without it the scrollbox can squash cards to fit the viewport instead of scrolling.

### Popup height must include padding, border and gap

The first fix only enlarged the popup slightly; the overlap remained because the arithmetic was
still wrong. Help needed 14 rows + 2 + 2 = 18, and Status needed 7 rows + 6 gaps + 2 + 2 = 17.
Any smaller height makes Yoga compress the rows, which looks like text drawn over text rather than
clipping.

**Lesson**: write the row count in a comment next to the constant (the code now does) and update
it whenever a line is added. A popup that is too short is worse than one that is slightly too
tall.

### The first truncation-marker format double-spaced the message

The first version always emitted `" [" + labels + "] "`, which produced two spaces when the
preceding text already ended in whitespace, and left the following text's leading space in place.
The final version computes `lead` from the previous segment and strips one leading space from the
next text segment.

**Lesson**: when assembling inline spans, own the whitespace at both boundaries. Render a few
real messages (`+LINES`, `+CHARS`, both, marker at start, marker after a tag) and check the frame.

### `onDelete` inside a state updater is not safe

The old delete path nested a side effect in `setSelectedIdx`. React may invoke an updater more than
once (StrictMode/concurrent rendering), which would delete twice. The fix reads the current index
and calls `onDelete` outside the updater.

**Lesson**: state updaters must be pure; side effects belong in event handlers or effects.

### The banner was part of the scrolled content

`stickyScroll`/`stickyStart="top"` does not pin an arbitrary first child. Moving the banner out of
the scrollbox and making it `flexShrink={0}` fixed it without changing `App`'s layout.

**Lesson**: a persistent chrome row is a sibling of the scrollable region, not its first row.

### `scrollChildIntoView` needs an id and one tick

The scrollbox exposes `scrollChildIntoView(id)`, but the selected card must already be laid out.
Calling it synchronously in the same render as the selection update can miss the new position.
`setTimeout(0)` defers until after layout; the cleanup clears a stale timeout if the user keeps
pressing `j`.

**Lesson**: give each list item a stable renderable id; drive scrolling from the selected id, not
from an index that can change under it.

## Verification

`make tui-test`: 139 pass, 0 fail, 186 expect calls (10 files).

Live in tmux against the nuc funnel backend:

- cards render with no blank padding and no clipped message lines;
- 8× `j` in select mode keeps the selected card on-screen; the banner stays at the top;
- Help shows all 14 rows; Status shows all 7 rows and the full funnel address;
- resize to 60×25 reflows cards to their content;
- `q` exits; stderr is clean.

## Follow-ups

- Add a popup test that asserts every row (not just the title) to catch a too-small `popupH`.
- Consider deriving `popupH` from a rows array instead of a hand-written constant.
- `truncate(pwd, 80)` is character-based; use the measured width if narrow terminals matter.
- Add a frame assertion for the truncation-marker spacing so the double-space regression cannot
  come back.
