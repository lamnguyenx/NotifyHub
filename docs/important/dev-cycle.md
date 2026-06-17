# OpenTUI — Development Cycle

How to edit, debug, and fix a terminal UI built with [OpenTUI](https://opentui.dev) + Bun + React.

## Quick Loop

```bash
# 1. Start any backend dependency

# 2. Edit sources (TSX/TS in src/)

# 3. Check types after every change
bun run tsc --noEmit

# 4. Run the TUI
bun run src/index.tsx

# 5. Observe errors / visual glitches in the terminal
# 6. Fix, goto 2
```

No hot-reload — after each change, kill and restart the TUI. Backend changes (Python, etc.) need manual restart too.

## Type checking

```bash
bun run tsc --noEmit
```

Always run before testing. Catches missing props, bad imports, path errors instantly. If your `package.json` wraps it:

```json
{ "scripts": { "typecheck": "tsc --noEmit" } }
```

Then: `bun run typecheck`.

## Debugging layout / visual glitches

### Card / box height and clipping

OpenTUI clips content that overflows a fixed-height `<box>`, starting from the **top**. If the header of a card is missing, the card content is too tall.

```tsx
// BAD — only counts hard newlines
const cardHeight = 4 + msg.split("\n").length

// BAD — hardcoded width estimates work for only one terminal size
const wrapped = msg.split("\n").reduce((s, l) => s + Math.ceil(l.length / 90), 0)

// GOOD — uses actual terminal width
const { width: termWidth } = useTerminalDimensions()
const contentWidth = Math.max(40, termWidth - 4) // 4 = borders + padding
const wrapped = msg.split("\n").reduce(
  (s, line) => s + Math.max(1, Math.ceil(line.length / contentWidth)), 0
)
const cardHeight = 4 + wrapped // 4 = header + pwd + border lines
```

**Gotcha**: Rounded borders (`borderStyle="rounded"`) add 2 lines (top + bottom) to the box height. Account for them.

**Overflow rule**: Content > box height → top gets clipped. If you see pwd/message but no avatar header, the card is too short.

### Text escaping a box

`borderStyle="single"` on a `<box height={1}>` draws all 4 sides. The border lines consume height and the text overflows below the box.

```tsx
// BAD — draws border on all 4 sides, text escapes below
<box height={1} borderStyle="single"><text>footer</text></box>

// GOOD — use a colored background for visual separation
<box height={1} backgroundColor="#2a2a2a" paddingX={1}><text>footer</text></box>
```

OpenTUI has no `borderPosition` prop. For a top-only divider, nest a 1-height border box inside a taller container, or skip borders and use background color.

### Missing elements on a dark background

If an element has a dark `fg` color on a black (`#000000`) background, it may be invisible. For avatars or badges, use:

```tsx
// Filled badge — white text on colored background, always visible
<span bg={color} fg="#ffffff"> A </span>
```

Avoid `TextAttributes.INVERSE` on spans — it can cause rendering issues in some terminals.

## Keyboard & focus

### Scrollbox must be focused

Without the `focused` prop, the scrollbox ignores arrow keys, PgUp/PgDn, Home/End:

```tsx
<scrollbox focused stickyScroll stickyStart="top" viewportCulling>
  {items.map(...)}
</scrollbox>
```

### useKeyboard consumes events

`useKeyboard` in React hooks consumes key events even when the handler returns early. If you have a toggle between "navigation mode" and "scroll mode":

```tsx
useKeyboard((key) => {
  if (key.name === "v") { setSelectMode(v => !v); return }
  if (!selectMode) return  // let scrollbox handle scrolling
  // ... handle nav keys ...
})
```

When `selectMode` is false, `return` early. The scrollbox (which must have `focused`) will handle arrows/PgUp/PgDn/Home/End natively.

### Ctrl+Z suspend

```tsx
useKeyboard((key) => {
  if (key.ctrl && key.name === "z") {
    renderer.suspend()                    // restore terminal
    process.kill(process.pid, "SIGTSTP") // suspend process
    return
  }
})

useEffect(() => {
  const onCont = () => renderer.resume()  // re-enable TUI
  process.on("SIGCONT", onCont)
  return () => { process.off("SIGCONT", onCont) }
}, [])
```

## Audio (OpenTUI native miniaudio)

```tsx
import { Audio } from "@opentui/core"

const audio = Audio.create({ autoStart: true })

// Load async (returns null on failure)
const sound = await audio.loadSoundFile("/absolute/path/to/sound.mp3")

// Play (silently fails if no audio device)
audio.play(sound, { volume: 0.5 })

// Cleanup
audio.dispose()
```

**Error resilience**: wrap every call in try/catch or `.catch()`. Audio failures (missing device, bad file) must never crash the TUI.

**Path resolution**:

```ts
// Relative to the source file, using import.meta.url:
new URL("../../assets/sound.mp3", import.meta.url).pathname

// Count ../ from the .tsx source file, not the project root.
// ../../ from src/components/ → tui/src/ → tui/
```

**TypeScript note**: `import.meta.dir` (Bun-specific) may not type-check — use `import.meta.url` with `URL` constructor instead.

## Common gotchas

| Symptom | Likely cause |
|---|---|
| Card header missing | `height` too small; content overflows → clipped from top |
| Text below footer box | `borderStyle` on 1-height box draws 4 sides, overflows |
| Arrow keys don't scroll | `<scrollbox>` missing `focused` prop |
| Element invisible on dark bg | fg color too dark; use `bg` + white fg for badges |
| Audio plays on startup | Sound fires on 0→N count jump; guard with `prevCount > 0` |
| `import.meta.dir` TS error | Use `new URL(rel, import.meta.url).pathname` |
| `borderPosition` TS error | Not an OpenTUI prop; use box nesting or bg color instead |
| Popup too small / too large | Use `useTerminalDimensions()` and `Math.floor(width * 0.8)` |

## Checks before submitting

- [ ] `bun run tsc --noEmit` passes
- [ ] All box heights account for borders + wrapping
- [ ] Scrollbox has `focused` prop
- [ ] Colors visible against current background
- [ ] Audio calls wrapped in try/catch
- [ ] Paths use `import.meta.url`, not hardcoded strings
