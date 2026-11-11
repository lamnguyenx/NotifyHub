# TUI Rendering Rules

Short, practical invariants for `src/notifyhub/tui/`. They come from the 2026-11-11 rendering
session; the longer story is in
[`docs/plans/2026/11/11/2026-11-11-tui-render-popup-lifecycle.md`](../plans/2026/11/11/2026-11-11-tui-render-popup-lifecycle.md).

## 1. Hooks: never branch around them

An early `return` before a hook changes the hook order when the branch changes:

```tsx
// BROKEN: locked rows skip both hooks
function NotificationRow({ item }: Props) {
  if (item.locked) return <LockedRow item={item} />
  const theme = useTheme()
  const { width } = useTerminalDimensions()
  …
}
```

Use a hook-free dispatcher and give each branch its own component:

```tsx
export function NotificationRow(props: Props) {
  return props.item.locked ? <LockedRow {...props} /> : <PlainRow {...props} />
}
```

Symptom when it breaks: the ErrorBoundary shows `Rendering error: …` on a row that switches
between locked and unlocked (or when keys change).

## 2. Sizing: let Yoga measure cards

Do **not** compute a card height from terminal width and line length. Wrapping, Unicode width,
optional rows and `wrapMode` make the estimate drift; the visible result is blank padding or
clipped text, worst after a resize.

```tsx
<box width="100%" flexShrink={0} …>   // no height
```

- `flexShrink={0}` is required inside a scrollbox; otherwise the scrollbox squashes cards to fit
  instead of scrolling.
- Use `wrapMode="none"` for single-line fields (title, pwd) so they cannot add an extra row.
- Strip trailing whitespace before splitting a message:
  `msg.replace(/\s+$/, "").split("\n")`.
- Do not render an optional row (`pwd`) when the value is empty; an empty `<text>` still takes a
  row.

## 3. Popups: count rows, gaps, padding and border

An absolute popup with a height smaller than its content does not clip cleanly — Yoga squeezes
rows and paints them over each other. The frame then looks like `Helpu(thisupopup)` and whole
lines disappear.

```
popupH = contentRows + gaps + 2 * padding + 2 * border
popupW = min(terminalWidth - 2, longestLine + 2 * padding + 2 * border)
```

Current values:

| Popup | Content rows | Gaps | Padding | Border | Height |
|---|---|---|---|---|---|
| Help | 14 | 0 | 2 | 2 | **18** |
| Status | 7 | 6 | 2 | 2 | **17** |

Status width also depends on the address: `min(width - 2, max(46, address.length + 22))`, because
a funnel host such as `nuc.tail0ec64c.ts.net:443` does not fit in 38 columns.

Add `zIndex={100}` to absolute popups so their stacking is explicit.

## 4. Escapes: JSX text is literal

```tsx
// BROKEN: the user sees \u2014
<text>NotifyHub \u2014 Help</text>

// CORRECT: the user sees —
<text>{"NotifyHub \u2014 Help"}</text>
```

This applies to titles, help rows, the select-mode banner, "Waiting…" and any other inline copy.
Escape sequences only work inside a JavaScript string expression.

## 5. Inline markers: own the whitespace

Plugin markers arrive as `[#truncated:+24 LINES]` / `[#truncated:+517 CHARS]`. When collapsing
adjacent markers into one note:

- lowercase the labels (`+24 lines`, `+517 chars`);
- join them with `, ` and bracket the result (`[+24 lines, +517 chars]`);
- add a leading space only when the previous segment does not end in whitespace;
- strip one leading space from the following text segment so the result is not double-spaced.

Render the four combinations (lines only, chars only, both, marker at start) and inspect the
frame.

## 6. Select mode: pin the banner, scroll by id

- The SELECT MODE banner is a **sibling** of the scrollbox (`flexShrink={0}` above it), not its
  first child; `stickyScroll` does not pin arbitrary content.
- Give every card a stable renderable id (`notification-row-<id>`) and scroll it into view after
  layout:

```tsx
useEffect(() => {
  if (!selectedId) return
  const t = setTimeout(() => scrollRef.current?.scrollChildIntoView(rowId(selectedId)), 0)
  return () => clearTimeout(t)
}, [selectedId])
```

- Never put a side effect such as `onDelete()` inside a `setState` updater; updaters run more than
  once under StrictMode/concurrent rendering. Read the current index in the key handler.

### 6.1 Waiting cards: chrome above the scrollbox

`WaitingCards` is pinned above the stream, not inside the scrollbox:

- `WaitingCards` uses `flexShrink={0}`; the scrollbox keeps `flexGrow={1}` + `minHeight={0}`.
- The container is borderless with `gap={1}` + `marginBottom={1}`; each `WaitingCard` owns its
  rounded border. Do not wrap the list in a second border.
- No fixed card height: the `@USER` task excerpt can wrap at narrow widths. Let Yoga measure it.
- Cards are display-only; they are not selectable and have no delete handling. If you move them
  inside the scrollbox, add selection indexing and a delete story first.
- The agent pill reuses `getHostModelTagColor`; the border is accent while running and warning
  while blocked/stalled.
- The timestamp is `since` (session age), not turn age; the status API has no `turn_since`.

## 7. Quit: destroy the renderer **and** exit

`renderer.destroy()` only tears down the screen. The SSE stream and poll timers keep Bun's event
loop alive, so the process hangs on a blank terminal.

- `q`: `renderer.destroy()` followed by `process.exit(0)`.
- `createCliRenderer({ onDestroy: () => process.exit(0) })` covers `Ctrl+C` and any other teardown
  path.

## 8. Debugging recipe

1. Reproduce with `testRender(<Component …>, { width, height })` + `captureCharFrame()`; assert
   specific rows and the presence of the last content row.
2. For the real check, run the TUI in a detached tmux pane, drive keys, and capture the pane.
3. If the screen says `Rendering error: …`, render the suspected component directly — the
   ErrorBoundary only shows the message, not the stack.
4. `make tui-test` must stay at 141+ passing; `make tui-typecheck` has pre-existing noise (missing
   `bun:test`/Node types and `CliRenderer.on/off` in `theme.tsx`) — compare against `HEAD`.

## Related plans

- [Waiting cards — parent plan](../plans/2026/11/11/2026-11-11-tui-waiting-cards.md)
- [Waiting cards — component plan](../plans/2026/11/11/2026-11-11-tui-waiting-cards-component.md)
- [Waiting cards — tests plan](../plans/2026/11/11/2026-11-11-tui-waiting-cards-tests.md)
