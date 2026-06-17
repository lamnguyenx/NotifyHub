# OpenTUI NotifyHub TUI

**Date**: 2026-06-17  
**Status**: ✅ COMPLETED  
**Target**: `src/notifyhub/tui/`

## Overview

Built a Terminal User Interface (TUI) for NotifyHub using OpenTUI (React bindings) + Bun. The TUI provides three views: live notification stream, notification history browser, and server status dashboard.

## Implementation

### Files Created

```
src/notifyhub/tui/
├── package.json
├── tsconfig.json
├── src/
│   ├── index.tsx              # Entry point
│   ├── App.tsx                # Main app + tab switching
│   ├── types.ts               # Shared TypeScript types
│   ├── utils/
│   │   └── api.ts             # REST client + SSE parser
│   ├── hooks/
│   │   └── useNotifications.ts  # SSE subscription hook
│   └── components/
│       ├── NotificationRow.tsx
│       ├── NotificationStream.tsx
│       ├── NotificationHistory.tsx
│       └── StatusDashboard.tsx
```

### Modified Files

- `Makefile` — Added `tui-deps` and `tui` targets

### How It Works

1. **SSE Connection**: `utils/api.ts` connects to `/events` via `fetch()` + `ReadableStream.getReader()`, manually parsing the SSE protocol (`event:` / `data:` fields separated by blank lines)
2. **State Management**: `hooks/useNotifications.ts` subscribes to SSE events and manages notification list + server info state
3. **Three Tabs**: LIVE (auto-scrolling stream), HISTORY (navigable list with delete), STATUS (connection + count dashboard)
4. **Keyboard**: Tab/arrows switch views, j/k navigate history, Delete removes items, q quits

## Trials & Errors

### 1. OpenTUI Framework Discovery

OpenTUI is a Zig-native TUI framework with TypeScript bindings, exclusive to Bun. Uses React (`@opentui/react`) or Solid.js for component rendering. Layout uses Yoga (flexbox). Key gotchas:
- JSX intrinsic elements are lowercase (`<box>`, `<text>`, `<scrollbox>`)
- No `bold` prop on `<text>` — use `attributes={TextAttributes.BOLD}` instead
- No `size`, `height` percentage for flex — use `flexGrow` instead
- `useKeyboard` events have `key.ctrl` not `key.modifiers?.ctrl`

### 2. React Version Mismatch (Blocking)

```
TypeError: undefined is not an object (evaluating 'ReactSharedInternals.S')
```

`@opentui/react` v0.1.107 required `react >= 19.2.0` but initial install resolved React 18.3.1. Fixed by:
- Updating to `@opentui/core@0.4.1` and `@opentui/react@0.4.1`
- Installing `react@^19` and `@types/react@^19`

### 3. SSE Parser CRLF Bug (Blocking)

Notifications appeared as empty list ("Waiting for notifications…") despite SSE `init` event firing correctly. Root cause: SSE uses CRLF (`\r\n`) line endings, but the parser split on `\n` and used `line === ""` to detect blank-line delimiters.

The line `"\r"` (CR only) was the actual blank line after `\n` splitting, but `""` never matched:
```typescript
// BROKEN: line after CRLF split is "\r", not ""
} else if (line === "" && currentEvent && currentData) {
```

Fixed by `line.trimEnd()` before all comparisons, which strips the trailing `\r`.

### 4. Backend API HEAD Request (Non-blocking)

`checkServerStatus()` used `fetch(url, { method: "HEAD" })` but FastAPI doesn't auto-generate HEAD handlers for GET routes. Fixed by using GET `/api/notifications` directly.

### 5. Flexbox Layout with Percentage Heights

Initial layout used `height="100%"` on the content area inside a flex column, creating a circular dependency (child wants 100% of parent, but parent's height depends on children). Fixed by replacing with `flexGrow={1}` on the content box, letting flex distribution calculate the remaining space.

### 6. JSX in .ts Files

TypeScript didn't parse JSX in `.ts` files even with `"jsx": "react-jsx"` — that setting only applies to `.tsx`. Renamed `index.ts` to `index.tsx`.

## Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| `@opentui/core` | ^0.4.1 | OpenTUI native rendering engine |
| `@opentui/react` | ^0.4.1 | React bindings for OpenTUI |
| `react` | ^19 | React runtime |
| `typescript` | ^5 | Type checking |

## Commands

```bash
make tui-deps    # Install TUI dependencies
make tui         # Run the TUI (backend must be running on :9080)
make backend     # Start backend (separate terminal)
```

## Future Improvements

- Clear all notifications keybinding (currently excluded due to Ctrl+C conflict with `exitOnCtrlC`)
- Configurable backend host/port (currently hardcoded to localhost:9080)
- Mouse support for clicking/selecting notifications
- Search/filter in history view
- Send notifications from within the TUI
