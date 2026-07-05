# TUI Testing Guide

## Mental model: TUI vs Web testing

| Web | TUI (OpenTUI) |
|---|---|
| React renders to DOM/HTML | OpenTUI renders to a character buffer (text grid) |
| Playwright reads the DOM | `captureCharFrame()` reads the full text grid |
| `getComputedStyle(el).color` | `captureSpans()` → per-cell fg/bg colors |
| `getComputedStyle(el).backgroundColor` | `captureSpans()` → per-cell bg colors |
| Playwright `page.keyboard.press()` | `mockInput.pressKey()` (note: not `.press()`) |
| Query `.popup` selector | Search for unique text in the flat frame |
| DOM has layered subtrees | Everything flattens to one grid via software compositing |

OpenTUI's test renderer creates a virtual terminal **in memory** — no real terminal needed, no alternate screen, no TTY.

## Infrastructure

### Dependencies

The test renderer comes from OpenTUI itself:

- `@opentui/core/testing` — `createTestRenderer()`, `captureCharFrame()`, `captureSpans()`, `KeyCodes`, `mockInput`, `mockMouse`
- `@opentui/react/test-utils` — `testRender()` (wraps React + test renderer together)

Bun's built-in test runner (`bun test`) is all you need — no Vitest, Jest, or Playwright required.

### Package.json setup

```json
{
  "scripts": {
    "test": "bun test"
  },
  "devDependencies": {
    "@opentui/core": "^0.4.1",
    "@opentui/react": "^0.4.1",
    "typescript": "^5.0.0"
  }
}
```

### Basic test structure

```tsx
// NotificationRow.test.tsx
import { testRender } from "@opentui/react/test-utils"
import { it, expect } from "bun:test"

it("renders the message text", async () => {
  const { captureCharFrame, renderer, renderOnce } = await testRender(
    <NotificationRow item={mockItem} selected={false} />,
    { width: 80, height: 8 }
  )
  await renderOnce()

  const frame = captureCharFrame()
  expect(frame).toContain("Build passed")

  renderer.destroy()
})
```

## Testing text content

Use `captureCharFrame()` which returns the full terminal grid as a plain string (each line separated by `\n`).

```tsx
const frame = captureCharFrame()

// Check for unique text anywhere in the frame
expect(frame).toContain("Waiting for notifications…")

// Check exact position (slice by row)
const lines = frame.split("\n")
expect(lines[0]).toContain("Build passed")
```

## Testing colors and styles

Use `captureSpans()` which returns structured data per character cell:

```typescript
interface CapturedFrame {
  cols: number
  rows: number
  cursor: [number, number]
  lines: CapturedLine[]
}

interface CapturedLine {
  spans: CapturedSpan[]
}

interface CapturedSpan {
  text: string       // visible text
  fg: RGBA           // foreground color
  bg: RGBA           // background color
  attributes: number // bitmask: NONE | BOLD | ITALIC | UNDERLINE | ...
  width: number
}
```

`RGBA` does not have `.toHex()`. Use the `rgbToHex()` function from `@opentui/core`:

```tsx
import { rgbToHex, TextAttributes } from "@opentui/core"

const spans = captureSpans()

// Find a span by text and check its foreground color
const colorful = spans.lines[0].spans.find(s => s.text.includes("colorful"))
expect(rgbToHex(colorful!.fg)).toBe("#15ff15")  // green
expect(colorful!.attributes & TextAttributes.BOLD).toBeTruthy()

// Check background color of first cell
const firstSpan = spans.lines[0].spans[0]
expect(rgbToHex(firstSpan.bg)).toBe("#000000")
```

`TextAttributes` bitmask values: `NONE`, `BOLD`, `DIM`, `ITALIC`, `UNDERLINE`, `BLINK`, `INVERSE`, `HIDDEN`, `STRIKETHROUGH`.

## Testing keyboard interaction

### API

The mock keyboard uses `pressKey()` (not `.press()`):

```tsx
const { captureCharFrame, renderOnce, mockInput } = await testRender(
  <App />, { width: 80, height: 24 }
)
await renderOnce()

mockInput.pressKey("v")      // simple character key
mockInput.pressKey("s")      // simple character key
mockInput.pressKey("ARROW_DOWN")   // named KeyCodes key
mockInput.pressKey("DELETE")       // named KeyCodes key
mockInput.pressKey("ESCAPE")       // named KeyCodes key
mockInput.pressKey("HOME")
mockInput.pressKey("END")
mockInput.pressKey("BACKSPACE")
```

`KeyCodes` from `@opentui/core/testing` has: `RETURN`, `LINEFEED`, `TAB`, `BACKSPACE`, `DELETE`, `HOME`, `END`, `ESCAPE`, `ARROW_UP`, `ARROW_DOWN`, `ARROW_RIGHT`, `ARROW_LEFT`, `F1`–`F12`.

There is no `PAGE_UP` or `PAGE_DOWN` in `KeyCodes`.

### Critical timing: one `renderOnce` behind

`pressKey()` emits data to stdin. `renderOnce()` calls `renderer.loop()` which processes **one frame**. The stdin event is parsed during the loop, but React's state update from `useKeyboard` needs a **second** render pass to appear in the character buffer.

**Always use two `renderOnce` calls after every key press:**

```tsx
import { act } from "react"

mockInput.pressKey("v")
await act(async () => { await renderOnce() })   // process event → React schedules update
await act(async () => { await renderOnce() })   // render the updated state
```

Wrap both `renderOnce` calls in `act()` — `pressKey` writes to stdin outside React's event system, and React logs warnings if `setState` inside `useKeyboard` fires outside `act()`.

**Don't use `flush()` for keyboard tests** — it waits for visual idle but doesn't force the second render pass. `flush()` is useful for waiting for async effects (SSE, animations) to settle.

Helper function pattern used in the NotifyHub test suite:

```tsx
async function press(key: string, mockInput: ..., renderOnce: ...) {
  mockInput.pressKey(key)
  await act(async () => { await renderOnce() })
  await act(async () => { await renderOnce() })
}
```

## Testing popups

Popups using `position: "absolute"` are composited into the same flat grid. No special handling needed — just assert on unique text:

```tsx
mockInput.pressKey("s")
await act(async () => { await renderOnce() })
await act(async () => { await renderOnce() })

const frame = captureCharFrame()
expect(frame).toContain("Connected")
expect(frame).toContain("Press any key to close")
```

### Unicode caveat

Unicode characters like `\u2014` (em dash) and arrows (`↑↓←→`) may render as literal escape sequences in `captureCharFrame()` rather than as the rendered glyph. Avoid asserting on text that contains these characters — use simpler substrings:

```tsx
// DON'T: expect(frame).toContain("NotifyHub — Status")
// DO:
expect(frame).toContain("NotifyHub")
expect(frame).toContain("Status")
```

Unicode arrows in `text` elements can also cause adjacent text lines to bleed into each other in the test renderer (width measurement issue). Avoid dense Unicode in assertion strings.

## Testing mouse interaction

`mockMouse` is available from `testRender()` return value:

```tsx
const { captureCharFrame, renderOnce, mockMouse } = await testRender(
  <App />, { width: 80, height: 24 }
)
await renderOnce()

// Scroll
await mockMouse.scroll(40, 10, "up")
await mockMouse.scroll(40, 10, "down")
await renderOnce()

// Click
await mockMouse.click(20, 5)
await renderOnce()
```

Available methods:

| Method | Description |
|---|---|
| `scroll(x, y, dir)` | Scroll at position; `dir`: `"up"`, `"down"`, `"left"`, `"right"` |
| `click(x, y, button?, opts?)` | Click at position; `button` defaults to `MouseButtons.LEFT` |
| `doubleClick(x, y)` | Double-click |
| `drag(startX, startY, endX, endY)` | Drag from start to end |
| `moveTo(x, y)` | Move cursor to position |
| `pressDown(x, y, button?)` | Press mouse button down |
| `release(x, y, button?)` | Release mouse button |
| `getCurrentPosition()` | Returns `{ x, y }` |

## Rounded boxes are Unicode

OpenTUI's `borderStyle="rounded"` uses standard Unicode box-drawing characters:

```
╭ ─ ╮
│   │
╰ ─ ╯
```

These are regular Unicode (U+256D–U+2570) and appear in `captureCharFrame()` like any other character:

```tsx
expect(captureCharFrame()).toContain("╭")
expect(captureCharFrame()).toContain("╰")
expect(captureCharFrame()).toContain("╯")
```

## Terminal selection caveat

Terminal emulators use **smart selection** — when you click-drag across text, most strip out box-drawing border characters (`╭─╮╰╯│`) because they're treated as decorative, not content. This can fool you into thinking borders are absent or that your test output is wrong.

**How to select borders by terminal:**

| Terminal | Method |
|---|---|
| **VSCode Terminal** | Regular selection works; xterm.js doesn't strip box-drawing chars. **macOS:** enable `Terminal › Integrated: Mac Option Click Forces Selection` for Option+click to work |
| **Ghostty** | Hold `Shift` while selecting to bypass smart copy and keep raw chars |
| **iTerm2** | `Option+Click+Drag` (rectangular selection) |
| **Kitty** | `Alt+Click+Drag` (rectangular selection) |
| **Any terminal** | Redirect to a file: `./app 2>&1 | tee output.txt` |

**The test renderer does NOT filter anything** — `captureCharFrame()` returns the full unfiltered grid including all border characters. This means test assertions on border chars are reliable even though manual copy-paste from a real terminal would drop them.

## Testing pure functions

Functions like `parseSSEStream`, `formatTime`, `getAvatarColor`, `getTitle`, `truncate`, and `parseMessage` don't need a renderer at all:

```ts
// utils.test.ts (note: .ts, not .tsx)
import { describe, it, expect } from "bun:test"

it("parses message tags", () => {
  expect(parseMessage("hello [#tag:info] world")).toEqual([
    { type: "text", text: "hello " },
    { type: "tag", text: "info" },
    { type: "text", text: " world" },
  ])
})

it("gets title from pwd", () => {
  expect(getTitle("/home/user/project")).toBe("project")
  expect(getTitle("")).toBe("notifyhub")
  expect(getTitle(null)).toBe("notifyhub")
})

it("truncates long strings", () => {
  expect(truncate("hello world", 8)).toBe("hello w…")
  expect(truncate("short", 20)).toBe("short")
})
```

**Important**: These functions must be `export`ed from their source files for tests to import them. Check before writing tests.

Run with: `bun test` or `make tt` from repo root.

## Testing components that call `fetch` (e.g. `App`)

Components using `useNotifications()` (or any hook that calls `fetch`) will connect to the real backend during tests. If the backend is running, the test frame gets populated with real data instead of the expected empty state.

**Always mock `globalThis.fetch`** for tests that render the full `App`:

```tsx
import { beforeAll, afterAll } from "bun:test"

const originalFetch = globalThis.fetch

beforeAll(() => {
  globalThis.fetch = async (url) => {
    if (url.includes("/api/notifications")) return new Response("[]", { status: 200 })
    if (url.includes("/events")) return new Response(null, { status: 200 })
    return new Response("", { status: 404 })
  }
})

afterAll(() => {
  globalThis.fetch = originalFetch
})
```

## Testing ErrorBoundary

When testing error boundaries with a child that throws, the error is caught by the boundary and the fallback renders correctly. However, the error also propagates to the test runner as an unhandled exception (noisy but does not fail the test):

```tsx
function Thrower() {
  throw new Error("test error")  // logged by test runner but caught by ErrorBoundary
  return null
}
```

Assert on the fallback content in the captured frame.

## Key points

- `captureCharFrame()` = plain text grid (what the user sees)
- `captureSpans()` = text + per-cell fg/bg colors + attributes
- `rgbToHex()` from `@opentui/core` converts `RGBA` to hex string
- Always call `await renderOnce()` after `testRender()` or any state change
- **Two `renderOnce` calls** after every `pressKey()`: one to process the event, one to render
- Wrap `renderOnce` calls in `await act(async () => { ... })` to suppress React warnings
- `renderer.destroy()` to clean up between tests
- Mock `globalThis.fetch` for tests that render the full `App`
- Avoid asserting on text with Unicode em dashes or arrows — use simpler substrings
- Popups, borders, absolute positioning — all flattened into one grid
- `@opentui/react/test-utils`'s `testRender()` wraps `createTestRenderer` + `createRoot` with `act()` for React
- Pure functions must be `export`ed from source files to be testable
