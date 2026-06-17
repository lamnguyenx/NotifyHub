---
title: Code Review — OpenTUI-based NotifyHub TUI (commit 1950215)
labels: code-review, tui, opentui
priority: high
status: CLOSED
resolution: fixed
---

# Code Review — OpenTUI-based NotifyHub TUI

**Commit**: `1950215` — Add OpenTUI-based terminal UI for NotifyHub  
**Date**: 2026-06-17  
**Status**: ✅ CLOSED — all findings resolved

## Summary

Reviewed 14 files (843 LOC) implementing a full terminal UI using OpenTUI React bindings + Bun. Found 3 bugs, 7 code-quality items. All 10 findings were fixed in follow-up commits.

---

## Findings

### 1. SSE Multi-Line Data Corruption ❌ → ✅

**File**: `src/notifyhub/tui/src/utils/api.ts:84-85`  
**Severity**: Bug (data loss)

The SSE parser overwrote `currentData` on each `data:` line instead of appending. If a notification JSON spanned multiple SSE data lines, only the last line was kept.

**Fix**: Changed assignment to concatenation:
```typescript
// Before
currentData = line.slice(6)
// After
currentData += (currentData ? "\n" : "") + line.slice(6)
```

Also extracted the SSE parsing loop into a standalone `parseSSEStream()` function.

---

### 2. Tag Markers Split by Truncation ❌ → ✅

**File**: `src/notifyhub/tui/src/components/NotificationRow.tsx:85-86`  
**Severity**: Bug (rendering glitch)

`firstLine(msg, 80)` truncated the raw message string before `parseMessage()` ran. If truncation cut through a `[#tag:hello]` or `[#truncated:world]` marker, the regex failed to match, leaving partial tag markers visible in the UI.

**Fix**: Replaced the two-step `firstLine` + `parseMessage` pipeline with `parseAndTruncate()` that:
1. Extracts the first line (up to `\n`)
2. Parses all tag segments from the full first line
3. Walks segments, accumulating visible length
4. Truncates only the final text segment, preserving tag integrity

---

### 3. Stale State in Rapid Deletes ❌ → ✅

**File**: `src/notifyhub/tui/src/components/NotificationStream.tsx:24`  
**Severity**: Bug (out-of-bounds index)

```typescript
// Before: stale notifications.length in closure
setSelectedIdx((prev) => Math.min(prev, notifications.length - 2))
```

If two deletes fired before React reconciled, the second used stale `notifications.length`, risking an out-of-bounds selected index.

**Fix**: Rewrote all keyboard handlers using functional updaters that reference the latest `prev` only. The `selectedIdx` is clamped against `notifications.length - 2` within the updater, and since `prev` is always the live value, rapid successive deletes stay valid.

---

### 4. No SSE Reconnection ⚠️ → ✅

**File**: `src/notifyhub/tui/src/utils/api.ts:54-102`  
**Severity**: Code quality (UX degradation)

SSE connection drops were permanent — the user had to restart the TUI.

**Fix**: Added an outer reconnect loop with exponential backoff (1s → 2s → 4s → ... → 30s max). On successful connection the delay resets. The `cancelled` flag properly stops the reconnect loop on cleanup.

---

### 5. Unprotected JSON.parse ⚠️ → ✅

**File**: `src/notifyhub/tui/src/hooks/useNotifications.ts:32,38,44`  
**Severity**: Code quality (crash vector)

All `JSON.parse()` calls on SSE data had no try/catch. Malformed payloads from a buggy backend would crash the TUI.

**Fix**: Wrapped all calls in a `safeParse<T>()` utility that returns a typed fallback on parse failure. Each SSE event handler checks the parsed result before mutating state.

---

### 6. Static SSE Status Label ⚠️ → ✅

**File**: `src/notifyhub/tui/src/components/StatusPopup.tsx:41-42`  
**Severity**: UX (misleading)

The status popup always showed "SSE Streaming" as static text, regardless of actual stream state.

**Fix**: Added `streaming: boolean` to `ServerInfo`. The SSE connection now calls an `onStatusChange` callback. The popup renders `● SSE Streaming` (green) or `○ SSE Idle` (orange) dynamically.

---

### 7. Missing Error Boundary ⚠️ → ✅

**File**: N/A (new: `src/notifyhub/tui/src/components/ErrorBoundary.tsx`)  
**Severity**: Code quality (crash resilience)

A render crash in any notification card would kill the entire TUI process.

**Fix**: Created a class-based `ErrorBoundary` wrapping `NotificationStream`. On error, it displays the error message in red instead of crashing.

---

### 8. Loose Type Indexer ⚠️ → ✅

**File**: `src/notifyhub/tui/src/types.ts:2`  
**Severity**: Low (type safety)

```typescript
// Before
[key: string]: any
// After
[key: string]: unknown
```

---

### 9. Index as React Key ⚠️ → ✅

**File**: `src/notifyhub/tui/src/components/NotificationRow.tsx:107-114`  
**Severity**: Low (stable in practice but fragile)

```typescript
// Before
<span key={i}>
// After
<span key={`${seg.type}-${i}-${seg.text.slice(0, 8)}`}>
```

---

### 10. No Typecheck Make Target ⚠️ → ✅

**File**: `Makefile`  
**Severity**: Low

Added `make tui-typecheck` (alias `make ttc`) mapping to `cd src/notifyhub/tui && bun run typecheck`.

---

## Files Changed

| File | Change |
|------|--------|
| `src/notifyhub/tui/src/types.ts` | `any` → `unknown`, added `streaming` field |
| `src/notifyhub/tui/src/utils/api.ts` | Multi-line SSE fix, reconnect loop, extracted `parseSSEStream` |
| `src/notifyhub/tui/src/hooks/useNotifications.ts` | `safeParse` wrapper, streaming status tracking |
| `src/notifyhub/tui/src/components/NotificationRow.tsx` | `parseAndTruncate`, better segment keys |
| `src/notifyhub/tui/src/components/NotificationStream.tsx` | Functional updaters everywhere |
| `src/notifyhub/tui/src/components/StatusPopup.tsx` | Dynamic streaming indicator |
| `src/notifyhub/tui/src/components/ErrorBoundary.tsx` | **New** — error boundary |
| `src/notifyhub/tui/src/App.tsx` | Wrapped `NotificationStream` in `ErrorBoundary` |
| `Makefile` | Added `tui-typecheck` / `ttc` target |

## Verification

```
$ cd src/notifyhub/tui && bun run typecheck
# Exit 0 — clean
```
