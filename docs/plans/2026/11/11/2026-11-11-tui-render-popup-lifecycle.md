# TUI render, popup and lifecycle fixes

**Date**: 2026-11-11
**Status**: Done (139 tests pass; verified live against the nuc funnel backend)
**Parent**: [`2026-11-10-tui-startup-transport-layout.md`](../10/2026-11-10-tui-startup-transport-layout.md)

Module: `src/notifyhub/tui/` — `src/index.tsx`, `src/App.tsx`, `src/components/`,
`src/__tests__/App.test.tsx`, plus the module README, the guides under `docs/important/`,
and the root README's TUI section.

Per-module docs:

| Module | Plan doc |
|---|---|
| `src/notifyhub/tui/src/components/` — cards, stream, popups | [`2026-11-11-tui-components-cards-popups.md`](2026-11-11-tui-components-cards-popups.md) |
| `src/notifyhub/tui/src/__tests__/` — popup assertion change | [`2026-11-11-tui-tests-popup-assertions.md`](2026-11-11-tui-tests-popup-assertions.md) |

Docs updated in the same pass:

| Doc | Change |
|---|---|
| [`docs/important/the-tui.md`](../../../../../docs/important/the-tui.md) | Select mode, help popup, card sizing, truncation markers, current theme, shortcuts, project structure, rendering rules |
| [`docs/important/tui-rendering-rules.md`](../../../../../docs/important/tui-rendering-rules.md) (new) | The invariants (hooks, sizing, popups, escapes, markers, select/scroll, quit) |
| [`docs/important/tui-testing-guide.md`](../../../../../docs/important/tui-testing-guide.md) | JSX-escape correction, popup row-completeness assertions, updated key points |
| [`src/notifyhub/tui/README.md`](../../../../../src/notifyhub/tui/README.md) (new) | Module overview, commands, keys, invariants, debugging checklist |
| [`src/notifyhub/tui/src/components/README.md`](../../../../../src/notifyhub/tui/src/components/README.md) (new) | Per-component responsibilities and sizing rules |
| [`src/notifyhub/tui/src/__tests__/README.md`](../../../../../src/notifyhub/tui/src/__tests__/README.md) (new) | Suites, conventions, what tests cannot catch |
| [`README.md`](../../../../../README.md) §16 | Keys table, module/doc links, content-sized cards/popups |

## Symptom

The TUI "still sucks" and "seems rendered erroring". The visible problems were:

- popup text drawn on top of other text (e.g. `Helpu(thisupopup)`), with whole help lines
  missing;
- literal `\u2014`, `\u2191`, `\u2026` sequences on screen;
- cards with stray blank lines, clipped text, or changing height after a resize;
- truncation markers glued to the message (`+24 LINES+517 CHARSyou restart now`);
- `MaxListenersExceededWarning` on stderr;
- select mode moved the selection off-screen;
- `q` blanked the screen but left the process alive.

The test suite passed (139 tests) and `make tui-typecheck` showed errors that were already
present on a clean checkout, so neither was a reliable signal.

## What changed

| Layer | Change | Files |
|---|---|---|
| Entry / quit | `q` calls `renderer.destroy()` **and** `process.exit(0)`; the renderer also gets an `onDestroy: () => process.exit(0)` safety net, so `Ctrl+C` cannot leave the SSE stream and poll timers holding the event loop open. | `src/index.tsx`, `src/App.tsx` |
| Popup sizing | Help grows from 15 to 18 rows; Status from 13 to 17 rows; Status width adapts to `<host>:<port>`. Both get `zIndex={100}`. Heights are counted as *content rows + gaps + padding + border*. | `components/HelpPopup.tsx`, `components/StatusPopup.tsx` |
| Popup escapes | Titles and key-binding lines move the escapes into JSX expressions (`{"NotifyHub \u2014 Help"}`) instead of raw JSX text. | `components/HelpPopup.tsx`, `components/StatusPopup.tsx` |
| Cards | `NotificationRow` is a hook-free dispatcher; locked and plain cards are separate components. Cards no longer guess a height from terminal width; Yoga measures the wrapped text and `flexShrink={0}` keeps them from being squashed. Trailing blank lines are dropped. | `components/NotificationRow.tsx` |
| Truncation markers | Adjacent `[#truncated:…]` segments collapse into one bracketed note: `[+24 lines, +517 chars] `. A leading space is added when the marker follows non-space text and removed from the text after it, so the note never glues. | `components/NotificationRow.tsx` |
| Per-row listeners | Removed `useTerminalDimensions()` from every card; only the popups and the app need terminal dimensions. | `components/NotificationRow.tsx` |
| Select mode | The select banner moved out of the scrollbox and is pinned; the selected card is scrolled into view by renderable id via `scrollChildIntoView()`. | `components/NotificationStream.tsx` |
| Delete key | Removed the side effect (`onDelete`) from inside a `setSelectedIdx` updater; the handler reads `selectedIdx` directly. | `components/NotificationStream.tsx` |
| Test assertion | The "status and help are mutually exclusive" test now asserts on the full popup titles, because the help body legitimately contains the word "Status". | `src/__tests__/App.test.tsx` |

The working tree also contained a 3-line `App.tsx` quit guard written at 08:36:22 (after the
reboot, not by this session). It does the same thing as the `index.tsx` `onDestroy` fix; both are
kept. `App.tsx` covers `q`, `onDestroy` covers every other renderer teardown (including `Ctrl+C`).

## Trials, errors and lessons

### "Rendering error" was the ErrorBoundary, not the renderer

The ErrorBoundary fallback (`Rendering error: <message>`) made the TUI look like the terminal
renderer itself was broken. The first concrete suspect was `NotificationRow`: it returned
`<LockedNotificationRow>` **before** calling its hooks, so a row switching between locked and
plain changed the hook order.

**Lesson**: React's Rules of Hooks bugs surface as an ErrorBoundary screen, not as a stack trace in
the TUI. Split the branches into separate components (a hook-free dispatcher) instead of adding
hooks before the early return. Stable notification keys can hide the bug in normal use; a key
change or a locked→unlocked transition is enough to trigger it.

### Fixed popup heights smaller than the content overlap rows

Help had 14 content rows but `height={15}` (14 + padding + border would already be 18), and Status
had 7 content rows plus 6 gaps but `height={13}`. Yoga shrank the rows and drew them on the same
line. The overlap also hid the `PgUp/PgDn` and `s  Status popup` lines.

**Lesson**: in OpenTUI, an absolute popup with `padding` and a border needs
`contentRows + gaps + 2 * padding + 2 * border`. If the height is too small, Yoga does not clip
cleanly — it overlaps lines. Count the rows when adding a line, or let the box size itself.

### JSX text does not process `\u` escapes

The source contained:

```tsx
<text>NotifyHub \u2014 Help</text>
```

JSX treats that as literal text, so the user saw `\u2014`. The same bug affected the help arrow
lines and the select-mode banner.

**Lesson**: escape sequences only work inside a JavaScript string expression:

```tsx
<text>{"NotifyHub \u2014 Help"}</text>
```

This is also why the old "avoid asserting Unicode in tests" advice was misleading — the popup was
not rendering Unicode badly, it was rendering the escape sequence literally.

### `toContain("Status")` encoded the overlap bug

`App.test.tsx` asserted that after `s` then `h`, the frame contained `"Help"` and did **not**
contain `"Status"`. That passed only because the help line `s  Status popup` had been swallowed by
the overlap. Once the popup rendered correctly, the test failed.

**Lesson**: assert on a unique, position-bearing string (here the popup titles
`NotifyHub — Help` / `NotifyHub — Status`), not a word that also appears in the body. A passing
test can be evidence of the bug, not of correct behavior.

### Guessed card heights vs Yoga measurement

`NotificationRow` computed `cardHeight = 4 + wrappedEstimate + (hostModel ? 1 : 0)` using the
terminal width. The estimate was wrong for wrapped lines, multiline messages, and `pwd` rows, and
after a resize it left blank padding or clipped content.

**Lesson**: do not hand-compute layout that Yoga can measure. Use `flexShrink={0}` on the card
inside the scrollbox and let the text determine the height. `wrapMode="none"` on single-line
fields (title, pwd) prevents an accidental extra row. Strip trailing whitespace before splitting
the message so a message ending in `\n` does not add an empty line.

### One resize listener per card

Each `NotificationRow` called `useTerminalDimensions()`, which subscribes to terminal resize
events. With a full feed this produced `MaxListenersExceededWarning`.

**Lesson**: terminal dimensions belong to the container/popup, not to every list item. Removing
the hook also removed the width-based height estimate, which was the source of the layout bug.

### A detached tmux pane was the right debugging tool

Tests and `captureCharFrame()` gave deterministic before/after frames, but the real TUI was
needed to see the popup overlap, the literal escapes, the truncation markers, and the resize
behavior. Running the TUI in a detached tmux session and capturing the pane made it possible to
drive keys and inspect the screen without blocking the shell.

**Lesson**: use `testRender` for assertions, and tmux for the final visual check. The real
terminal catches problems the test renderer does not (the testing guide already documents that
`captureSpans()` and the terminal can diverge).

### `q` blanked the screen but the process did not exit

`renderer.destroy()` tears down the alternate screen, but the open SSE connection and the poll
timers keep Bun's event loop alive. The result was a dead screen and a process that never
returned.

**Lesson**: destroying the renderer is not the same as ending the process. Call
`process.exit(0)` after `renderer.destroy()` in the quit path, and use the renderer's `onDestroy`
hook as a safety net for `Ctrl+C` and any other teardown path.

### Rebooted machine + zero-byte files looked like a concurrent session

Four files (`NotificationRow.tsx`, `NotificationStream.tsx`, `HelpPopup.tsx`, `StatusPopup.tsx`)
were 0 bytes at 08:36:16. The previous boot ended at 08:36:14. The initial conclusion — another
Claude session was editing the same directory — was wrong: `uptime` and `ps` showed a single
session, and the reboot had interrupted the writes before they reached disk.

**Lesson**: before blaming a concurrent editor, check uptime and the process list. Restore only
files that are actually empty (never overwrite non-empty user work), then run `sync` so the
rewrite is flushed. The "other session" row in the dock was this session reporting its own status.

### Typecheck noise is still noise

`make tui-typecheck` still reports missing `bun:test`/Node type declarations,
`CliRenderer.on/off` in `theme.tsx`, and an old `ErrorBoundary` test. The same error classes exist
on a clean checkout; the new `process.exit` calls only add instances of the existing
missing-Node-types error, not a new category. Run the check against `HEAD` before treating a type
error as new.

## Verification

| Check | Result |
|---|---|
| `make tui-test` | 139 pass, 0 fail, 186 expect calls, 10 files |
| Live feed | Cards render at the funnel backend; no blank padding or clipped messages |
| Select mode | `v`, then 8× `j`: selection stays on-screen and the banner stays pinned |
| Help popup | Every row visible, including PgUp/PgDn and `s  Status popup` |
| Status popup | Every row visible; `nuc.tail0ec64c.ts.net:443` fits on one line |
| Resize | 60×25: cards reflow to their content, no overflow |
| Quit | `q` exits with code 0; `Ctrl+C` exits via `onDestroy` |
| stderr | Clean during the live run |

## Follow-ups

- Add a regression test that asserts every help/status row appears (the manual row count in
  `popupH` is easy to break when a line is added).
- Consider computing popup height from the content instead of a constant; OpenTUI absolute boxes
  may support auto height, but it was not verified here.
- `truncate(pwd, 80)` is still character-based, not width-based; very narrow terminals can clip
  the pwd line.
- Fix the pre-existing `CliRenderer.on/off` type errors by using the documented event API or a
  local type shim.
