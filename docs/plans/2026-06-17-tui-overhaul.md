# TUI Overhaul — 2026-06-17

> Full session log: notification ordering, theme, avatar rendering, card layout, keyboard, audio, suspend.

## Completed

### 1. Sort order: newest-first, scroll to top

**Files:** `hooks/useNotifications.ts`, `components/NotificationStream.tsx`

- Backend stores newest-first (`insert(0, ...)`). Kept that order in the TUI.
- SSE `notification` events prepend (`[item, ...prev]`) instead of appending.
- Initial load and periodic refresh return data as-is (no reversal).
- Changed `stickyStart="top"` so the scrollbox anchors to the top on start.

> Originally tried oldest-first + sticky bottom. User reversed decision.

### 2. Full message text (match web UI)

**File:** `components/NotificationRow.tsx`

- Removed `parseAndTruncate(msg, 80)` — was taking only the first line and cutting to 80 chars.
- Now splits message by `\n` and renders every line as a separate `<text>`, with per-line `[#tag:...]` / `[#truncated:...]` parsing.
- Card height is dynamic: accounts for newline-split lines AND terminal line wrapping.

### 3. VSCode-style high-contrast theme

**Files:** `App.tsx`, `NotificationRow.tsx`, `StatusPopup.tsx`

Replaced the original dark grays with pure black `#000000`, white `#ffffff` borders, and cyan `#6fc3df` accents:

| Role | Before | After |
|---|---|---|
| Page bg | `#0a0a0a` | `#000000` |
| Card bg (normal/selected) | `#141414` / `#1e1e1e` | `#000000` / `#0d0d0d` |
| Card border (normal/selected) | `#2a2a2a` / `#555555` | `#ffffff` / `#6fc3df` |
| Message text | `#d4d4d4` | `#ffffff` |
| Tags | `#aaaaaa` | `#6fc3df` |
| Dimmed text | `#888888` | `#a0a0a0` / `#969696` |
| Status green/red/idle | `#66bb6a` / `#ef5350` / `#ffa726` | `#15ff15` / `#ff5555` / `#ffcc00` |

### 4. Avatar: colored box with white text

**File:** `components/NotificationRow.tsx`

- Avatar initial now renders as `<span bg={avatarColor} fg="#ffffff"> A </span>` — a colored pill matching the web UI's `<Avatar>`.
- 6 dark palette colors replaced with bright alternatives (e.g., `#004D40` → `#43A047`) so they're visible on black.

Trials and errors: see [Avatar rendering](#avatar-rendering-trial--error) below.

### 5. Card height accounts for line wrapping

**File:** `components/NotificationRow.tsx`

```ts
const contentWidth = Math.max(40, termWidth - 4)
const wrappedEstimate = messageLines.reduce(
  (sum, line) => sum + Math.max(1, Math.ceil(line.length / contentWidth)),
  0,
)
const cardHeight = 4 + wrappedEstimate
```

Uses `useTerminalDimensions()` for accurate wrap estimation. Previous attempts: fixed denominator `/90` (too generous, cards too tall), `/60` (wasted bottom padding), then dynamic via terminal width (correct).

Trials and errors: see [Card height clipping](#card-height-clipping-trial--error) below.

### 6. Select mode (`v` toggle)

**File:** `components/NotificationStream.tsx`

- Default: arrow keys, PgUp/Dn, Home/End scroll the feed natively.
- Press `v` → blue banner appears, keys switch to card navigation/selection.
- `Esc` deselects, `Del` deletes selected card.
- Toggling select off auto-deselects.

### 7. Help popup

**Files:** `App.tsx`, `components/HelpPopup.tsx` (new)

- `h` / `?` toggles a centered overlay listing all key bindings.
- Width: 80% of terminal (`Math.floor(termWidth * 0.8)`).
- Help and status popups are mutually exclusive; any key dismisses.

### 8. Notification sound

**Files:** `hooks/useAudio.ts` (new), `components/NotificationStream.tsx`, `assets/Submarine.mp3` (copied)

- Uses OpenTUI's native `Audio.create()` miniaudio engine.
- Loads `Submarine.mp3` on mount, plays at 50% volume when notification count increases.
- Skips initial load (guard: `prevCount > 0`).
- All audio calls wrapped in try/catch + `.catch()` — never crashes the TUI.

### 9. Ctrl+Z suspend

**File:** `App.tsx`

- Detects `key.ctrl && key.name === "z"`.
- Calls `renderer.suspend()` then `process.kill(pid, "SIGTSTP")`.
- `SIGCONT` listener → `renderer.resume()`.

### 10. Footer and spacing

- `marginBottom={0}` on cards (from 1) — tighter vertical spacing.
- Footer bar uses `#2a2a2a` background (same gray as selected card).
- Simplified to single-line, no border separator.

### 11. Scrollbox focus

- Added `focused` prop to `<scrollbox>` so arrow keys scroll immediately on startup.

## Avatar rendering — Trial & Error

1. **Symptom**: android-live-translator cards had no avatar. NotifyHub showed an orange "N".
2. **First fix**: Replaced 6 dark palette colors (`#004D40`, `#00579B`, etc.) with bright alternatives. Didn't help.
3. **Second fix**: Added `bg={avatarColor} fg="#000000"` to make a filled badge. Broke rendering — whole cards had no header.
4. **Third fix**: Tried `TextAttributes.INVERSE`. Still broken.
5. **Root cause discovered**: The avatar WAS rendering — but the **card height** was too small for long message lines that wrapped in the terminal. The content overflowed, and OpenTUI clipped from the top, deleting the header line. The card appeared to have no avatar, but the entire header was gone.
6. **Actual fix**: Fixed card height to account for terminal line wrapping (see #5 above). Then added `bg={avatarColor} fg="#ffffff"` pill style with `" A "` padding. Everything worked.

**Lesson**: When an element is "not showing" at the top of a fixed-height card, check if the card content overflows from the bottom — OpenTUI clips from the top.

## Card height clipping — Trial & Error

| Attempt | Formula | Result |
|---|---|---|
| 1 | `4 + newlineCount` | Clipped headers on wrapped lines |
| 2 | `6 + ceil(lineLen / 90) per line` | Too much bottom padding |
| 3 | `4 + ceil(lineLen / 60) per line` | Still too much padding for short lines |
| 4 | `4 + ceil(lineLen / contentWidth) per line` where `contentWidth = termWidth - 4` | **Correct** — uses actual terminal width |

**Lesson**: Always use `useTerminalDimensions()` for width-dependent layout. Hardcoded char-width estimates are never right across terminals.

## Footer border — Trial & Error

1. Used `borderStyle="single"` on a 1-height separator box. Rendered as `┌─┐` + `└─┘` consuming 2+ lines, pushing text below.
2. Tried wrapping in a column container with explicit heights. Text still escaped.
3. Tried `borderPosition="top"` — not a valid prop in OpenTUI.
4. **Final**: Dropped the border entirely. Used `#2a2a2a` background for the footer to visually separate it from the notification area. Single 1-height box.

**Lesson**: OpenTUI's `borderStyle` on a 1-height box draws all 4 sides. For a simple divider, use a colored background instead of borders.

## Files touched

| File | Change |
|---|---|
| `hooks/useNotifications.ts` | Sort order (newest-first), prepend SSE items |
| `components/NotificationRow.tsx` | Full message, theme, avatar pill, dynamic card height |
| `components/NotificationStream.tsx` | Select mode toggle, sticky top, focused, sound on new notif |
| `App.tsx` | Theme, Ctrl+Z suspend, help popup, footer |
| `components/StatusPopup.tsx` | Theme colors |
| `components/HelpPopup.tsx` | **New** — key binding reference overlay |
| `hooks/useAudio.ts` | **New** — OpenTUI native audio wrapper |
| `assets/Submarine.mp3` | **New** — copied from frontend |
