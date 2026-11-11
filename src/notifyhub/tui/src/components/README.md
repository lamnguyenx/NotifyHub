# TUI Components

React components rendered by OpenTUI. Container-level rules live in
[`../../../../../docs/important/tui-rendering-rules.md`](../../../../../docs/important/tui-rendering-rules.md);
the module overview is [`../../README.md`](../../README.md).

## Components

| File | Responsibility | Notes |
|---|---|---|
| `NotificationStream.tsx` | Scrollable feed, select mode, lazy-load trigger | Owns `selectedIdx` and `selectMode`; banner is outside the scrollbox |
| `NotificationRow.tsx` | One notification card, plain or `LOCKED` | Hook-free dispatcher; card height is measured by Yoga |
| `WaitingCards.tsx` | Waiting notification cards for running/blocked/stalled sessions | `flexShrink={0}`; `@USER` task + `@ASSISTANT loading`, agent/host pills, spinner + stale mirror |
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

### Waiting cards

- Waiting cards are **pinned above the scrollbox** (`flexShrink={0}`), not scroll children. The
  stream keeps `flexGrow={1}` + `minHeight={0}`. Moving the cards inside the feed would make them
  scroll away and force select-mode/delete semantics onto display-only state.
- The `WaitingCards` container is borderless with `gap={1}` + `marginBottom={1}`; each
  `WaitingCard` owns its rounded border. The border color is accent while running, warning while
  blocked/stalled.
- No fixed height. The `@USER` task excerpt is one line from the API but can wrap at narrow
  widths; let Yoga measure the card.
- Card chrome reuses `NotificationRow` helpers (`getTitle`, `getAvatarColor`,
  `formatRelativeTime`, `getHostModelTagColor`, `truncate`) so the waiting card and the eventual
  completion card match.
- The agent pill uses the dimmed tag color from `getHostModelTagColor(agent, background)`.
  Unknown agents fall back to `●`. The reporting machine's host pill sits to its right with the
  same treatment (matching `host_model` on completed cards) and the one-cell `⌂` glyph; a null
  host omits the pill. Avoid emoji such as `🖥` — double-width glyphs break narrow headers.
- `@ASSISTANT` is a total state switch: `loading <spinner>` (running), `waiting for you ⚠`
  (blocked), `stalled? ◼` (stale), `idle` (unreachable through the container, kept for direct
  renders). The spinner interval runs only while running.
- The 5-minute stale window is mirrored client-side; SSE entries can remain `running` between
  events.
- The timestamp is `since` — session age, not turn age. The status API has no `turn_since`.
- Idle entries are filtered by the container; a running card disappears when its completion
  notification (`data.session_id`) or an `idle` status arrives.

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

- [Waiting cards — parent plan](../../../../../docs/plans/2026/11/11/2026-11-11-tui-waiting-cards.md)
- [Waiting cards — component plan](../../../../../docs/plans/2026/11/11/2026-11-11-tui-waiting-cards-component.md)
- [Waiting cards — tests plan](../../../../../docs/plans/2026/11/11/2026-11-11-tui-waiting-cards-tests.md)
- [Waiting card machine ID](../../../../../docs/plans/2026/11/11/2026-11-11-tui-waiting-card-machine-id.md)
- [Machine-ID component](../../../../../docs/plans/2026/11/11/2026-11-11-tui-waiting-card-machine-id-component.md)
- [Prototype harness](../../../../../docs/plans/2026/11/11/2026-11-11-tui-prototype-mode-harness.md)
- [Component/lifecycle plan](../../../../../docs/plans/2026/11/11/2026-11-11-tui-components-cards-popups.md)
- [Testing guide](../../../../../docs/important/tui-testing-guide.md)
