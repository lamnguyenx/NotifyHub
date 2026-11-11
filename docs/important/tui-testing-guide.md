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

Rendering invariants these tests exercise: [`tui-rendering-rules.md`](tui-rendering-rules.md).

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

## Testing layout and flex sizing

Layout regressions (a waiting card/header losing a row, a scrollbox covering a sibling, text
bleeding into a header) are visible in the character frame. Render the **real composition** at a
fixed size and assert on specific rows:

```tsx
const r = await testRender(
  <box flexDirection="column" width="100%" height="100%">
    <box width="100%" flexGrow={1} flexDirection="column" minHeight={0}>
      <WaitingCards entries={entries} now={now} />
      <NotificationStream notifications={items} onDelete={() => {}} />
    </box>
    <box width="100%" height={1}><text>FOOTER</text></box>
  </box>,
  { width: 60, height: 20 },
)
await act(async () => { await r.renderOnce() })

const lines = r.captureCharFrame().split("\n")
expect(lines[1]).toContain("proj1")
expect(lines[4]).toContain("@USER")
expect(lines[5]).toContain("@ASSISTANT")
expect(lines[19]).toContain("FOOTER")
```

Rules learned from the 2026-11-10 dock/stream bug:

- In a column, a child with `height="100%"` claims the **whole** area and overflows past its
  siblings; Yoga then shrinks the other children. Use `flexGrow={1}` + `minHeight={0}` for the
  scrollable child and `flexShrink={0}` for headers/waiting cards.
- `expect(frame).toContain("proj1")` can pass even when another row was overwritten. Assert
  specific row indices and assert the **absence** of stream text in the header rows.
- Empty states hide layout bugs. Test with enough content to fill the viewport.
- For quick probes, dump `index + JSON.stringify(line)` for each frame line so clipping/overlap
  is visible in the test output.

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

A JSX **text child** does not process escape sequences:

```tsx
// BROKEN: renders the six characters \u2014
<text>NotifyHub \u2014 Status</text>

// CORRECT: renders an em dash
<text>{"NotifyHub \u2014 Status"}</text>
```

If `captureCharFrame()` shows `\u2014`, `\u2191` or `\u2026`, the source has the escape in JSX
text — fix the source, then assert the real glyph. This was the actual cause of the 2026-11-11
popup-title bug, not a renderer limitation.

Dense Unicode in a single `text` element can still hit width-measurement issues in the test
renderer, so keep assertions focused on one short line where possible.

### Testing popup sizing and row completeness

An absolute popup with a fixed height that is smaller than its content does **not** clip cleanly:
Yoga squeezes the rows and draws them over each other. In a frame assertion this looks like
missing lines or words running together (`Helpu(thisupopup)`), and `toContain` on one row can
still pass.

When a popup height is a constant, assert the **first and last content rows** (or every row):

```tsx
// Help: 14 content rows, 18 total
expect(frame).toContain("Toggle select mode")
expect(frame).toContain("Press any key to close")

// Status: 7 content rows, 17 total
expect(frame).toContain("Notifications:")
expect(frame).toContain("Locked rows:")
```

For the mutual-exclusion test, assert on the full titles, not a word that also appears in the
body:

```tsx
expect(frame).toContain("NotifyHub — Help")
expect(frame).not.toContain("NotifyHub — Status")
```

`toContain("Status")` passed for months only because the help line `s  Status popup` was hidden
by the overlap bug. A test that encodes a rendering bug will fail when the bug is fixed — treat
that failure as a signal to inspect the assertion, not to revert the fix.

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

## Testing E2E crypto

`utils/crypto.ts` is pure/async and needs no renderer. Prefer the deterministic
**fixture** pattern over round-tripping through the module:

```ts
import { decryptEnvelope, importKey, resetE2EKeyForTests, setE2EKeyForTests } from "../utils/crypto"

const FIXTURE_KEY_B64 = "AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8="
const FIXTURE_IV_B64 = "AAECAwQFBgcICQoL"
const FIXTURE_CT_B64 = "..."  // produced by Python's AESGCM

it("decrypts the Python-encrypted fixture", async () => {
  const key = await importKey(FIXTURE_KEY_B64)
  const payload = await decryptEnvelope(
    { e2e: 1, alg: "A256GCM", iv: FIXTURE_IV_B64, ct: FIXTURE_CT_B64 },
    key,
  )
  expect(payload).toEqual({ message: "...", pwd: "/tmp/fixture" })
})
```

The **same fixture constants are asserted by `tests/notifyhub/backend/test_crypto.py`**,
which pins Python-encrypt ⟷ JS-decrypt compatibility. If you change the envelope
format, AAD (`"notifyhub:v1"`), or key encoding, regenerate the fixture and
update both suites.

Key resolution hooks:

- `setE2EKeyForTests(b64)` — force a key; `setE2EKeyForTests(null)` — force "no key".
- `resetE2EKeyForTests()` — drop the override so env/file resolution applies.
- To test file resolution, point `NOTIFYHUB_E2E_KEY_FILE` at a temp file written
  with `bun`'s `node:fs`, then `resetE2EKeyForTests()` and assert
  `decryptItem(...).locked`.

## Testing components that call `fetch` (e.g. `App`)

Components using `useNotifications()` (or any hook that calls `fetch`) will connect to the real backend during tests. If the backend is running, the test frame gets populated with real data instead of the expected empty state.

**Always mock `globalThis.fetch`** for tests that render the full `App`:

```tsx
import { beforeAll, afterAll } from "bun:test"

const originalFetch = globalThis.fetch

beforeAll(() => {
  globalThis.fetch = async (url) => {
    if (url.includes("/api/notifications")) return new Response("[]", { status: 200 })
    if (url.includes("/api/e2e")) return new Response('{"enabled":false,"alg":null,"kid":null}', { status: 200 })
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

## captureSpans() captures the painted buffer (but test ≠ terminal)

`captureSpans()` reads `renderer.currentRenderBuffer.getSpanLines()` — the **in-memory painted buffer**, not the ANSI output to the terminal. This is the same composited cell grid that the renderer serializes to escape sequences.

**The test buffer and the terminal can diverge** for inline `<span bg>` in non-first position. In this project, a non-first inline `<span bg={color}>` appeared correct in `captureSpans()` but fell back to a default color when rendered to the real terminal. The avatar (first inline span) worked fine — only later spans showed the divergence. Switching to `<box backgroundColor={color}>` pills in a flex row fixed it.

**Rule of thumb**: When `captureSpans()` shows the correct cell colors but the terminal shows wrong colors:
1. Verify the box/span bg actually works in a different visual position.
2. Hardcode a known color (e.g. `#FF0000`) to isolate rendering vs color-source issues.
3. Check whether the INPUT to the color function varies as expected — the test might be using a different input than production (e.g., the test passes a varied host_model but production data is constant).

## Color derivation for short strings needs a good hash

The avatar color comes from `getAvatarColor(pwd)` which uses the DJB2 hash (`h = h * 31 + c`). This works fine for long pwd paths but **clusters short strings** (3-15 chars) onto adjacent palette slots:

| Hash | "foo" | "bar" | "claude" | "Mac153" | "nuc" |
|------|-------|-------|----------|----------|-------|
| DJB2 | idx 9 | idx 9 | idx 9 | idx 10 | idx 11 |
| FNV-1a | idx 3 | idx 2 | idx 3 | idx 1 | idx 11 |

For the host_model tag, which receives short strings (hostnames, model names), use **FNV-1a** (`hash ^= c; hash = Math.imul(hash, 16777619) >>> 0`) instead of DJB2. FNV-1a has proper avalanche in the first few bytes, crucial when hashing into a small modulo space (mod 15).

The palette (`AVATAR_COLORS`) is shared; only the hash function differs between `getAvatarColor` (DJB2, for long strings) and `getHostModelColor` (FNV-1a, for short strings).

### Testing dimmed/derived colors

When you dim a color by mixing it with a background, test both the mixing function and the rendered result:

```ts
// Test the mixing function directly
it("mixes evenly at ratio 0.5", () => {
  expect(mixHex("#000000", "#ffffff", 0.5)).toBe("#808080")
})

it("returns the first color at ratio 1", () => {
  expect(mixHex("#ff0000", "#000000", 1)).toBe("#ff0000")
})

// Test the rendered color in the component
it("renders host_model tag with dimmed bg color", async () => {
  const { captureSpans, renderOnce } = await testRender(
    <NotificationRow item={hostItem} />, { width: 80, height: 8 }
  )
  await renderOnce()
  const spans = captureSpans()
  const hostSpan = spans.lines.flatMap(l => l.spans).find(s => s.text.includes("@gpt-4"))
  expect(rgbToHex(hostSpan!.bg).toLowerCase())
    .toBe(getHostModelTagColor("gpt-4", "#000000").toLowerCase())
})
```

The mixing helper (`mixHex`, `getHostModelTagColor`) is a pure function — test it in `utils.test.ts` without a renderer. Only one integration test needs a renderer to confirm the bg color reaches the painted buffer.

`mixHex` linearly interpolates RGB channels: each channel `= round(a * ratio + b * (1 - ratio))`. Test boundary cases (ratio 0, ratio 1, ratio 0.5) plus 3-digit hex expansion (`#fff` expanded to `#ffffff`).

## Key points

- `captureCharFrame()` = plain text grid (what the user sees)
- `captureSpans()` = text + per-cell fg/bg colors + attributes
- `rgbToHex()` from `@opentui/core` converts `RGBA` to hex string
- Always call `await renderOnce()` after `testRender()` or any state change
- **Two `renderOnce` calls** after every `pressKey()`: one to process the event, one to render
- Wrap `renderOnce` calls in `await act(async () => { ... })` to suppress React warnings
- `renderer.destroy()` to clean up between tests
- Mock `globalThis.fetch` for tests that render the full `App` (including `/api/e2e`)
- E2E crypto is pure/async — test it with the shared cross-language fixture + `setE2EKeyForTests`/`resetE2EKeyForTests`, no renderer needed
- Assert on unique strings (full popup titles, first/last rows), not words that can appear in
  nearby content; a passing `toContain` can hide an overlap bug
- Escape sequences must live in `{"…"}` expressions, not JSX text children; after fixing the
  source, assert the real glyph (`NotifyHub — Help`)
- Popup height must include content rows + gaps + padding + border; assert the last content row
- In column layouts, prefer `flexGrow` + `minHeight={0}` over `height="100%"`, and
  `flexShrink={0}` for headers/waiting cards; assert layout at specific row indices
- A waiting card is **7 rows** (border, header, time, pwd, `@USER`, `@ASSISTANT`, border) plus a
  one-row gap. The committed layout test uses one card at 60×20 and asserts rows 1/3/4/5; a
  3-card composition needs at least 25 rows including the footer.
- Cards should let Yoga measure their height (`flexShrink={0}`); a hand-computed height drifts
  with wrapping and resizes
- Spinner intervals (`useSpinner`, 120 ms) cause React `act(...)` warnings in the in-memory
  renderer. They are the same pattern the old dock tests had; assertions still pass. Use fake
  timers if the noise becomes a problem.
- `@opentui/react/test-utils`'s `testRender()` wraps `createTestRenderer` + `createRoot` with `act()` for React
- Pure functions must be `export`ed from source files to be testable
- Quit/exit behavior (`process.exit(0)`, `onDestroy`) cannot be asserted in-process; check it in a
  subprocess or a real tmux pane

## Related plans

- [Waiting cards — tests plan](../plans/2026/11/11/2026-11-11-tui-waiting-cards-tests.md) —
  139 → 141 tests, layout row indices, act-warning caveat.
- [Waiting cards — component plan](../plans/2026/11/11/2026-11-11-tui-waiting-cards-component.md)
- [Waiting cards — parent plan](../plans/2026/11/11/2026-11-11-tui-waiting-cards.md)
