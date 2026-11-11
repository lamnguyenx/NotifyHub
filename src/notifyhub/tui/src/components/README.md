# TUI Components

React components rendered by OpenTUI. Container-level rules live in
[`../../../../../docs/important/tui-rendering-rules.md`](../../../../../docs/important/tui-rendering-rules.md);
the module overview is [`../../README.md`](../../README.md).

## Components

| File | Responsibility | Notes |
|---|---|---|
| `NotificationStream.tsx` | Scrollable feed, select mode, lazy-load trigger | Owns `selectedIdx` and `selectMode`; banner is outside the scrollbox |
| `NotificationRow.tsx` | One notification card, plain or `LOCKED` | Hook-free dispatcher; card height is measured by Yoga |
| `AgentStatusDock.tsx` | Live running/blocked/stalled agent rows | `flexShrink={0}`; spinner + stale mirror |
| `StatusPopup.tsx` | Centered connection/e2e status | 17 rows; width adapts to `host:port` |
| `HelpPopup.tsx` | Centered key-binding reference | 18 rows; 60 columns max |
| `ErrorBoundary.tsx` | Fallback when a child render throws | Shows `Rendering error: <message>` only |

## Invariants

### Cards

- No `height` on a card. Use `flexShrink={0}` inside the scrollbox; otherwise cards are squashed
  instead of scrolled.
- `wrapMode="none"` on single-line fields (title, pwd) so they cannot add a row.
- Strip trailing whitespace before splitting a message; render `\u00a0` for an empty body line.
- Do not render an optional row (`pwd`) when the value is empty.
- Truncation markers from the plugins (`[#truncated:+N LINES]`, `[#truncated:+N CHARS]`) collapse
  into `[+N lines, +N chars] ` and own the whitespace on both sides.

### Popups

```text
height = content rows + gaps + 2 (padding) + 2 (border)
width  = min(terminal - 2, longest line + 2 (padding) + 2 (border))
```

- Help: 14 content rows + padding 2 + border 2 = **18**.
- Status: 7 content rows + 6 gaps + padding 2 + border 2 = **17**.
- Too small a height makes Yoga **overlap** rows, not clip them. Update the row count comment and
  the height when adding a line.
- Escape sequences must be in a string expression:
  `<text>{"NotifyHub \u2014 Help"}</text>`.
- Absolute popups use `zIndex={100}`.

### Stream

- The SELECT MODE banner is a sibling above the scrollbox (`flexShrink={0}`), not a scroll child.
- Cards get `id={"notification-row-" + n.id}`; the selection effect calls
  `scrollChildIntoView()` after layout (`setTimeout(0)`).
- Delete handling must not call `onDelete()` inside a `setState` updater.
- The scrollbox uses `flexGrow={1}` + `minHeight={0}` in the parent column.

### Lifecycle

`renderer.destroy()` only clears the screen. Quit paths call `process.exit(0)` (see
`src/App.tsx` and `src/index.tsx`'s `onDestroy`).

## Adding a component

1. Use `useTheme()` for colors; do not hard-code hex values.
2. Keep terminal-dimension subscriptions at the container/popup level; never one per list row.
3. If the component has branches that call hooks, split them into separate components.
4. Add a `testRender()` test in `../__tests__/`; assert the first and last visible rows for
   fixed-height content.
5. Check the real TUI in tmux for overlap, resize and exit behavior.

## Related

- [Component/lifecycle plan](../../../../../docs/plans/2026/11/11/2026-11-11-tui-components-cards-popups.md)
- [Testing guide](../../../../../docs/important/tui-testing-guide.md)
