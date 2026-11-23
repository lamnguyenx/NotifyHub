# TUI: dismissible docked cards, mouse, and right-click context menu

**Date**: 2026-11-20
**Status**: Done (162 tests pass)
**Scope**: parent repo only (`src/notifyhub/tui/`, docs). No submodule changes —
`_submodules/mactoast` is vendored, not a git repo, and was untouched.

Module: `src/notifyhub/tui/` — `App.tsx`, `hooks/useNotifications.ts`,
`components/{WaitingCards,NotificationStream,NotificationRow,ContextMenu,HelpPopup}.tsx`,
the prototype harness, and the TUI tests.

## Goal

The docked waiting cards above the feed were display-only: `Delete` deleted feed
notifications but could not touch a docked card, and the TUI had no mouse support beyond
the renderer's default wheel scrolling. Two requests, in sequence:

1. Support **deleting/dismissing docked notification cards** ("delete docked noti support").
2. Support **mouse use, right-click to delete** — which was then corrected mid-session to
   *"don't default right-click to dismiss; add a right-click context menu to do more"*.

The final behavior: docked cards are first-class select-mode citizens (`Delete`/`Backspace`
dismisses them), and right-clicking **any** card opens a keyboard-and-mouse-navigable
context menu (select, copy message/task/pwd/session id, delete/dismiss).

## What changed

### Shared selection order (dock → feed)

`NotificationStream` previously owned `selectMode` and `selectedIdx` for the feed alone.
That state moved to `AppView`, which builds one ordered key list:

```
[...waitingEntries.map(waitingEntryKey), ...notifications.map(notificationKey)]
```

`NotificationStream` became a pure receiver (`selectMode`, `selectedId`, banner,
scroll-into-view). `j`/`k`, `PgUp`/`PgDn`, `Home`/`End` walk the visible dock first, then
the feed; navigating past the end still triggers a lazy `loadMore`.

`Delete`/`Backspace` on a docked key calls `handleDismissAgentStatus(sessionId)`; on a
notification key it calls `handleDelete(id)`. After a keyboard delete the selection moves
to the neighboring card; menu/mouse deletes just clear the selection if it pointed at the
removed card.

A selected waiting card keeps its semantic state border (running accent / blocked warning /
stalled danger) and switches its background to `theme.surfaceSelected`, so you can tell
*what state* you are about to dismiss.

### Dismissal bookkeeping (`useNotifications.ts`)

Dismissing a docked card is client-only (the agent keeps running; the backend has no
status-delete). To stop a dismissed card from immediately reappearing:

- `dismissAgentStatus(sessionId)` records a **signature** — `state + "\0" + task` — before
  removing the entry.
- `agent_status` SSE events and the reconnect resync (`GET /api/status`) drop entries whose
  signature matches the recorded dismissal.
- Any meaningful change (state transition, new prompt) changes the signature, so the card
  reappears for the *new* turn; a completion push clears the record entirely
  (`removeAgentStatus`).

### Right-click context menu (`ContextMenu.tsx`, new)

Right-click on a card reports `(target, x, y)` upward from the card's outer box.
`AppView` opens `ContextMenu` at those absolute terminal coordinates:

| Action | Feed notification | Waiting card |
|---|---|---|
| `Select card` | select mode on that card | select mode on that card |
| `Copy message` / `Copy task` | message with `[#tag:…]`/truncation markers stripped | task excerpt |
| `Copy pwd` | notification `pwd` | session `pwd` |
| `Copy session id` | — | agent session id |
| destructive | `Delete notification` (danger red) | `Dismiss card` (danger red) |

- Copy actions use the renderer's OSC 52 clipboard (`renderer.copyToClipboardOSC52`); the
  footer flashes `Message copied` / `Clipboard unavailable` for 1.5 s (that notice
  temporarily replaces the `L:older` hint).
- Menu keys: `j`/`k`/`↑`/`↓` (wrapping), `Enter` runs, `Esc` closes, **any other key closes
  the menu instead of firing its global action** (no accidental `q`-quit while a menu is up).
- Mouse: hover highlights a row, left-click runs it, click outside closes (root handler),
  and the menu's own boxes `stopPropagation()` so their clicks don't close themselves.
- Geometry: content-sized (`actions + 3` rows, longest row + 4 columns), `zIndex={200}`
  above the status/help popups (100), clamped so the whole menu stays inside the terminal.

### Everything else

- `HelpPopup`: `Del Delete/dismiss card` line clarified, `Right-click Open context menu`
  added → height 18 → **19** rows.
- SELECT MODE banner text: `Del: delete/dismiss` and a shortened layout that fits 80 columns.
- Prototype harness (`PrototypeApp.tsx`) mirrors both features (`dismissedStatus` state),
  so `make tui-prototype` demos dismissal and the menu.
- No backend change: `/api/status` and `agent_status` already carry everything the menu
  copies.

## Trials, errors and lessons

### Right-click → immediate delete was the wrong default

The literal first reading of "right click to delete" shipped: right-click deleted the feed
card / dismissed the docked card straight away, no confirmation. The user pushed back
immediately — a context menu was the intent, and a single accidental right-click destroying
a notification is bad UX anyway.

**Lesson**: when a destructive action gets a brand-new input path, default to a menu or an
undo, not to immediate effect. "Right-click to delete" almost always means "right-click
opens the menu where delete lives".

### Selection order had to live above both areas

Keeping `selectMode` in `NotificationStream` would have needed a second focus concept for
the dock. Moving the state into `AppView` and passing `selectMode`/`selectedId` down made
one ordered key list serve navigation, Delete, and the menu's `Select card` action.

**Lesson**: when two areas start sharing a keyboard interaction, hoist the interaction
state to their common parent instead of syncing two local states.

### The Escape test failed: lone ESC waits on the stdin parser

`pressEscape` via `mockInput.pressKey("ESCAPE")` produced no key event — a lone `\x1b`
might be the start of a longer sequence, so OpenTUI's parser holds it for a 20 ms timeout
before flushing. The test waits ~30 ms, then `renderOnce()`.

**Lesson**: escape-sequence input is *delayed by design*. Tests that press Esc must wait
out the parser timeout (found in `@opentui/core`: `DEFAULT_TIMEOUT_MS = 20`).

### Menu-overlap broke a frame assertion

A test asserted the card text (`docked work`) was still visible with the menu open — but
the menu renders *on top of* that text, so `captureCharFrame()` doesn't contain it. The
assertion was dropped; visibility-under-overlay is not observable in a char frame.

**Lesson**: in a single-layer character grid an overlay hides what it covers. Assert the
overlay's rows and the non-overlapped content; never assert that covered text is visible.

### Mouse test plumbing: types vs runtime

The mock mouse comes from `@opentui/core/testing` (`MockMouse`, `MouseButtons`); the event
enum used in components is `MouseButton` from `@opentui/core`. Typing the test helper's
parameter as `{ click: (x, y, button?: number) => ... }` failed typecheck against the real
`MockMouse` (optional `MouseEventOptions` param). Fix: import `type MockMouse` and use it
directly.

**Lesson**: when wrapping a library's test helper, take its real type from the library
instead of re-declaring a structurally-similar signature.

### `entry.pwd` narrowing did not survive into a closure

`if (entry.pwd) { menuItems.push({ run: () => copy(entry.pwd) }) }` failed typecheck:
`AgentStatusEntry.pwd` is `string | null`, and TS does not keep the truthiness narrowing
inside the callback closure. Hoisting `const pwd = entry.pwd ?? ""` fixes both narrowing
and intent.

**Lesson**: hoist nullable fields into locals before capturing them in callbacks.

### Raw mouse events in tmux verify what the in-memory renderer cannot

The mock mouse feeds the parser directly, but terminal-level behavior (does a real
right-click reach the app? does hover work?) needed raw SGR sequences over tmux:
right-click press/release is `\x1b[<2;COL;ROW M` / `m`, left-click `\x1b[<0;…`.
Synthesizing them with `tmux send-keys -H` confirmed the menu opens and runs actions.

**Lesson**: `mockMouse` proves the handler logic; only raw sequences in a real terminal
prove the event actually arrives at stdin and survives the parser.

### One added popup row raced through five docs

Adding the `Right-click` row moved the help height 18 → 19, which was restated in the root
`README.md`, `docs/important/the-tui.md`, `docs/important/tui-rendering-rules.md` (table),
`docs/important/tui-testing-guide.md` (comment), `src/notifyhub/tui/README.md`, and
`src/notifyhub/tui/src/components/README.md`.

**Lesson**: popup heights are documented in at least six places. Change them together
(`grep -rn "14 content rows\|18 rows"` catches them) or the next contributor sizes from a
stale doc and reintroduces the overlap bug the counters were added for.

### Test counts are a documented floor

`make tui-test` went 154 → 155 → 159 → 162, and the count is printed in the TUI README,
the tests README ("keep the suite at 162+"), and this record.

**Lesson**: update the advertised floor in the same commit as the new tests.

## Verification

- `make tui-test` — **162 pass, 0 fail, 12 files** (new `AppView.test.tsx` with 16 tests:
  shared selection order, keyboard delete-vs-dismiss, right-click menu open, keyboard-run,
  mouse-run, clipboard copy with markers stripped, Escape-close, Home/End, `l` and
  end-of-list load-more).
- `make tui-typecheck` — only the documented pre-existing classes (missing `bun:test`/Node
  types in old tests, `ErrorBoundary` test, one `utils.test` overload); no new categories.
- Live: detached tmux panes running `bun src/prototype.tsx` — `v j Delete` dismisses a
  docked card and reselects the next; raw right-click opens the menu; `k` + `Enter` and a
  left-click on the item row both run `Dismiss card`.

## Related

- Parent docs updated this session: `README.md` (§9 keys + waiting cards),
  `docs/important/the-tui.md` (features, §1.1 Context Menu, keys, structure, history),
  `docs/important/agent-status.md` (reading it),
  `docs/important/tui-rendering-rules.md` (§6 selection, §6.1 right-click/menu rules,
  help-height table), `docs/important/tui-testing-guide.md` (help row count).
- Module docs: `src/notifyhub/tui/README.md`, `src/notifyhub/tui/src/components/README.md`,
  `src/notifyhub/tui/src/__tests__/README.md`.
- Predecessors: [`2026-11-11-tui-waiting-cards.md`](../11/2026-11-11-tui-waiting-cards.md)
  (the card that became interactive),
  [`2026-11-11-tui-prototype-polish.md`](../11/2026-11-11-tui-prototype-polish.md)
  (state colors/tint the menu reuses).
