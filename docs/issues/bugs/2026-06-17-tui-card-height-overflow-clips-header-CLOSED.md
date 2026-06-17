# TUI Card Height Overflow Clips Header

> **Status:** CLOSED  
> **Date:** 2026-06-17  
> **Component:** `src/notifyhub/tui/src/components/NotificationRow.tsx`

## Symptoms

- Notification cards with long (wrapping) message text lost their header line entirely (avatar initial, app title, timestamp)
- Cards missing the header appeared to have no "profile picture" / avatar
- Affected only notifications where message lines exceeded ~90 characters, causing terminal line wrapping

## Root Cause

In `NotificationRow.tsx`, the card `height` was calculated as:

```tsx
const cardHeight = 4 + messageLines.length
```

This only counted hard `\n` newline splits. It did not account for soft wrapping when a single message line exceeds the terminal column width. The inner content overflowed the card box, and OpenTUI clipped from the **top**, which removed the header `<text>` (avatar + title + time) from view.

## Fix

Added a wrapping estimate per message line in `NotificationRow.tsx:92-96`:

```tsx
const messageLines = msg.split("\n")
const wrappedEstimate = messageLines.reduce(
  (sum, line) => sum + Math.max(1, Math.ceil(line.length / 90)),
  0,
)
const cardHeight = 4 + wrappedEstimate
```

Each message line contributes at least 1 row, plus additional rows if the line length exceeds 90 characters (conservative terminal width estimate). The server cap is 200 chars per message, so worst-case wrapping is 3 rows per line (ceil(200/90) = 3).

## Files Changed

| File | Change |
|------|--------|
| `src/notifyhub/tui/src/components/NotificationRow.tsx` | Card height now accounts for line wrapping; also switched avatar rendering back to plain `fg` (no `INVERSE`) |

## Related Context

- Also replaced 6 dark avatar colors (e.g., `#004D40`) with brighter high-contrast alternatives suitable for the new `#000000` background theme
- Notifications are sorted newest-first (latest at top) after a separate fix in `useNotifications.ts`
