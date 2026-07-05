# `formatTime` doesn't handle `Invalid Date` — CLOSED

**Date**: 2026-07-05
**Status**: ✅ FIXED
**Fix**: `src/notifyhub/tui/src/components/NotificationRow.tsx:7`

## Symptom

`formatTime("")` and `formatTime("not-a-date")` returned `"Invalid Date"` instead of the input string unchanged.

## Root Cause

`new Date("")` creates a `Date` object with `Invalid Date` but does **not** throw. The `try/catch` block never triggered, so the error value propagated through `d.toLocaleTimeString()` which returned `"Invalid Date"`.

## Fix

Added `isNaN(d.getTime())` check after `new Date(iso)`:

```typescript
export function formatTime(iso: string): string {
  try {
    const d = new Date(iso)
    if (isNaN(d.getTime())) return iso  // <-- added
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
  } catch {
    return iso
  }
}
```
