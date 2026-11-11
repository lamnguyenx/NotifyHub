# TUI stream/dock layout: flex sizing, not overlap

**Date**: 2026-11-10
**Status**: Done (verified with a headless render)
**Parent**: [`2026-11-10-tui-startup-transport-layout.md`](2026-11-10-tui-startup-transport-layout.md)

Module: `src/notifyhub/tui/src/App.tsx`, `src/notifyhub/tui/src/components/NotificationStream.tsx`,
`src/notifyhub/tui/src/components/AgentStatusDock.tsx` (+ new `layout.test.tsx`).

## Symptom

After the SSE parser fix restored startup history, the dock looked corrupted: one live-agent row
was missing and stream/card text appeared to interfere with the dock. With an empty stream the
layout had looked fine.

## Root cause

`App` lays out a column: the dock, then the notification stream, then a one-line footer. The
stream's scrollbox used:

```tsx
<scrollbox width="100%" height="100%" ...>
```

`height="100%"` resolves against the **whole** flex area, not the space left after the dock. The
sum (dock height + full parent height) overflows, and Yoga shrinks the other flex items to fit.
The dock has no minimum height, so it lost one row to shrink; its content was clipped and the
next row appeared where a different row belonged.

Headless capture (60×16, three live sessions), before:

```text
00 ┌──────────────────────────────────────────────────────────┐
01 │ ⠋ ◇ opencode · proj1 · now                               │
02 │ ⠋ ◇ opencode · proj3 · now                               │   ← proj2 clipped
03 └──────────────────────────────────────────────────────────┘
04
05 ╭─────────────────────────────────────────────────────────╮▀  ← stream flush against dock
```

With no notifications the stream was a three-row placeholder, so the overflow was invisible.

## Fix

- `App.tsx`: the content area is an explicit `flexDirection="column"` with `minHeight={0}`.
- `NotificationStream.tsx`: the scrollbox uses `flexGrow={1}` and `minHeight={0}` instead of
  `height="100%"` — it takes the remaining space after the dock.
- `AgentStatusDock.tsx`: `flexShrink={0}` so a header-like dock keeps its full height.

After:

```text
00 ┌──────────────────────────────────────────────────────────┐
01 │ ⠋ ◇ opencode · proj1 · now                               │
02 │ ⠋ ◇ opencode · proj2 · now                               │
03 │ ⠋ ◇ opencode · proj3 · now                               │
04 └──────────────────────────────────────────────────────────┘
05
06 ╭─────────────────────────────────────────────────────────╮▀
```

## Regression test

`src/notifyhub/tui/src/__tests__/layout.test.tsx` mirrors `App`'s structure (column → flexGrow
content box → dock + stream, then footer), renders at 60×16 with three status rows and 20
notifications, and asserts:

- dock rows 1–3 still contain `proj1`, `proj2`, `proj3`;
- no `notification-*` text appears in the dock area;
- the stream renders below the dock;
- the footer stays on the last line.

## Trials, errors and lessons

### `height="100%"` + a sibling above = overflow

In a Yoga column, use `flexGrow={1}` + `minHeight={0}` for the scrollable region and
`flexShrink={0}` for fixed headers/docks. `100%` height is a sibling-unaware claim.

### Empty states hide layout bugs

The dock was added while the stream was usually empty; once real history arrived, the overflow
surfaced. Capture frames with realistic content when changing layouts.

### `toContain` can hide overwritten text

A frame assertion like `toContain("proj1")` can pass even when another row was overwritten. The
regression test asserts specific row indices and the absence of stream text in the dock rows.
For manual probes, dump indexed lines (`JSON.stringify` each line) rather than eyeballing the
frame.

### Reproduce in `testRender`, not by restarting the real TUI

`testRender(...)` + `captureCharFrame()` at a fixed size made the shrink/overflow deterministic
and gave before/after evidence. The real terminal is the final check, not the debugging tool.

## Verification

`make tui-test`: 139 pass, 0 fail (10 files). The new layout test passes; the previous frame
showed `proj1/proj3` only, the fixed frame shows `proj1/proj2/proj3` with the stream below.
