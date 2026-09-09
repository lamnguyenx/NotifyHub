# Card Layout Polish

**Date**: 2026-09-09
**Status**: Done

## Goal

Polish the notification card layout: space between folder name and host tag, align timestamp to the top-right corner, make host model color more subtle, and find the right home for the host pill.

## Final state

```
╭──────────────────────────────────────────────╮
│ P project                              @host │
│                                         time │
│ /home/user/project                           │
│ Build passed                                 │
╰──────────────────────────────────────────────╯
```

- Host pill sits at top-right corner of each card, directly above the timestamp
- Both pill and timestamp are right-aligned via `flexGrow={1}` spacer
- Host pill uses a dimmed/darkened version of its hash color: `mixHex(brightColor, cardBg, 0.4)` (user tuned from 0.3 to 0.4)
- Card height auto-adjusts: `4 + wrappedEstimate + (hostModel ? 1 : 0)`
- No "slack" gap: inner column `height="100%"` + flexGrow spacer above footer pins the pill to the bottom when it was there

## Implementation history (trials and errors)

### Step 1: Space + timestamp alignment

**What**: Added trailing space to title text (` {title} `), and a `<box flexGrow={1} />` spacer before the timestamp on the title row.

**Result**: Space worked. Timestamp went to the right. Simple, clean.

### Step 2: Dim the host pill background

**What**: Added `mixHex(a, b, ratio)` that linearly interpolates RGB channels, and `getHostModelTagColor(hostModel, bg)` using ratio = 0.3. Replaced `getHostModelColor(hostModel)` in the pill's `backgroundColor`. Changed text fg from `#ffffff` to `theme.text` (pastel background in light theme needs dark text).

**Result**: User manually changed ratio to 0.4 — satisfied.

### Step 3: Move host pill to bottom-right

**What**: Removed host pill from title row, added a footer row after message lines with `<box flexDirection="row"><flexGrow={1} /><bg pill>`, bumped `cardHeight` by `+ (hostModel ? 1 : 0)`.

**Result**: Pill at bottom-right per request.

### Step 4: "Awkward new line" — slack gap between pill and bottom border

**What**: The `wrappedEstimate` heuristic over-counts rows when long message lines don't wrap (they overflow horizontally). `cardHeight = 4 + wrappedEstimate + 1` leaves slack → empty line between pill row and bottom border.

**Trial 4a**: Added `<box flexGrow={1} />` above the footer + `height="100%"` on the inner column. Flex spacer absorbs whatever slack exists, pinning the footer flush to the bottom border.

**Result**: No gap regardless of `wrappedEstimate` accuracy. Belt-and-suspenders fix.

### Step 5: Move host pill to top-right corner, stacked above timestamp

**What**: Moved host pill back to title row (right-aligned), dropped time to a dedicated sub-row directly underneath. When no `hostModel`, time stays on the title row (original position). Removed bottom footer block + its flexGrow spacer. Removed `height="100%"` since no longer needed.

**Structure**:
```tsx
<box flexDirection="row" width="100%">
  <avatar />
  <title />
  <flexGrow />                                   // push right
  {hostModel ? <host pill /> : <time />}         // row 1 right side
</box>
{hostModel && (
  <box flexDirection="row" width="100%">
    <flexGrow />
    <time />                                     // row 2 right side
  </box>
)}
```

**Result**: User confirmed "working as i want".

## Key technical findings

### 1. Card height estimation can be wrong for non-wrapping lines

In OpenTUI, `<text>` elements don't auto-wrap. Long lines overflow horizontally. The original `wrappedEstimate` heuristic (`Math.ceil(line.length / contentWidth)`) assumes wrapping, producing over-estimates → card has slack rows when rendering doesn't wrap.

**Fix for footer-pinning**: `<box flexGrow={1} flexShrink={1} />` spacer + inner column `height="100%"` — any extra space is absorbed invisibly. This is more robust than trying to compute exact height.

### 2. `wrappedEstimate` is still needed for cardHeight

Even though lines don't wrap (horizontal overflow), `wrappedEstimate` provides an upper bound on the vertical content. Without it, multi-line messages produce cards clipped from the top. The estimate is a safety net, not an exact measurement.

### 3. Conditional sub-row for time

When host_model is present, time drops to a sub-row directly below the host pill. Both are right-aligned via the same `flexGrow` spacer pattern. When host_model is absent, time reverts to the title row (its original position). This conditional avoids empty space when there's no host pill.

### 4. Color dimming via mixHex

`mixHex(a, b, ratio)` linearly interpolates RGB channels:
```
r = Math.round(a.r * ratio + b.r * (1 - ratio))
g = Math.round(a.g * ratio + b.g * (1 - ratio))
b = Math.round(a.b * ratio + b.b * (1 - ratio))
```

At ratio 0.4, the bright hash color is blended 40/60 with the card background. On dark theme (bg #000), this creates a deep tone. On light theme (bg #fff), a pastel. The pill text uses `theme.text` (not `#ffffff`) so it's readable on both light and dark.

## Files changed

1. **`src/notifyhub/tui/src/components/NotificationRow.tsx`**:
   - Added `parseHex`, `mixHex`, `HOST_MODEL_DIM_RATIO`, `getHostModelTagColor` — color dimming helpers
   - Title row text: ` {title} ` → ` {title}` (no trailing space, host pill no longer adjacent)
   - Title row end: `<time>` → conditional `<host pill> : <time>`
   - Added time sub-row (only when hostModel present): `<flexGrow /><time>`
   - Removed bottom footer block entirely
   - Removed `height="100%"` from inner column
   - `cardHeight` unchanged: `4 + wrappedEstimate + (hostModel ? 1 : 0)`

2. **`src/notifyhub/tui/src/__tests__/NotificationRow.test.tsx`**:
   - Updated import from `getHostModelColor` to `getHostModelTagColor`
   - Host bg assertion uses `getHostModelTagColor(hostModel, "#000000")`

3. **`src/notifyhub/tui/src/__tests__/utils.test.ts`**:
   - Added `getHostModelTagColor` test suite: valid hex, dimmer-than-base, mixing accuracy, determinism
   - Added `mixHex` test suite: ratio 0/1 boundaries, 50/50 mix, 3-digit hex expansion
   - Updated imports

## Test status

```
103 pass, 0 fail, 129 expect() calls across 7 files
```