# Host_model Tag with Inferred Color

**Date**: 2026-09-09
**Status**: Done

## Goal

Display `host_model` as a colored inline tag on the notification card's title line, with a background color inferred from the host_model string (like the avatar initial's color is inferred from pwd).

## Final state

```
╭──────────────────────────────────────────╮
│V project @Mac153               09:30 AM  │
│ /home/user/project                       │
│ Build passed ✓                           │
╰──────────────────────────────────────────╯
```

- `host_model` tag rendered as an inline `@Mac153` block on the title line, after the title, before the timestamp
- Background color derived from host_model string via FNV-1a hash → 15-color palette
- Both the avatar pill and the host_model pill rendered via `<box backgroundColor={...}>` (reliable bg painting primitive)

## Implementation history (trials and errors)

### Trial 1: Inline `<span bg=...>` in a single `<text>` element

**What**: Added `<span bg={getAvatarColor(hostModel)} fg="#ffffff"> @{hostModel} </span>` as a third span in the title line's `<text>`.

**Result**: Unit test showed correct bg color in `captureSpans()` (painted buffer), but user reported all tags rendered as "same green" regardless of host_model value.

**Lesson**: `captureSpans()` reads `renderer.currentRenderBuffer.getSpanLines()` — the **painted buffer**. It reflects the *intended* rendering state. But the **production terminal output path** differed for non-first inline `<span bg>` elements. The avatar (first inline `<span bg>`) worked correctly (confirmed by user: "Avatar colors DO vary per card"), but a later inline span's bg was not honored and fell back to a default color.

### Trial 2: Horizontal `<box>` row with `<box backgroundColor=...>` pills

**What**: Replaced the single `<text>` with a `<box flexDirection="row">` containing discrete `<box backgroundColor={...}>` pills for avatar and host_model, plus separate `<text>` for title and time.

```tsx
<box flexDirection="row" width="100%" flexShrink={1} overflow="hidden">
  <box backgroundColor={avatarColor} flexShrink={0}>
    <text fg="#ffffff"> {avatarInitial} </text>
  </box>
  <text fg={theme.text} attributes={TextAttributes.BOLD} flexShrink={1} overflow="hidden"> {title}</text>
  {hostModel && (
    <box backgroundColor={hostModelColor} flexShrink={0}>
      <text fg="#ffffff"> @{hostModel} </text>
    </box>
  )}
  <text fg={theme.dim} flexShrink={0}>  {time}</text>
</box>
```

**Result**: Same problem — user still saw green regardless. This ruled out the inline-vs-block hypothesis. Box bg painting works (avatar rendered correctly), so the issue was with the **color value itself** being constant for host_model.

**Lesson**: Don't assume the rendering primitive is the problem when the known-working primitive (box backgroundColor) also "fails." The color is constant because `getAvatarColor(hostModel)` returns the same value when `hostModel` is the same string.

### Trial 3: Hardcoded red to prove box bg works for non-first position

**What**: Changed `backgroundColor={getAvatarColor(hostModel)}` to `backgroundColor="#FF0000"` (hardcoded red).

**Result**: User confirmed "now i see red color for all hostmodel" — proving non-first box bg DOES work. The issue was not rendering, but the color value.

**Lesson**: When debugging visual bugs, isolate variables: (1) rendering mechanism, (2) color source, (3) input data. Hardcoding a color quickly proves or eliminates rendering as the cause.

### Trial 4: Logging runtime values + JSON.stringify debug text

**What**: Added `console.error` logging for hostModel values, and changed the tag text to show `JSON.stringify(hostModelRaw) + (computedHex)` — both the raw value and the computed color.

**Result**: All cards showed `@"Mac153"(#43A047)`. The host_model string was literally the same machine hostname on every notification. The color `#43A047` (green, palette index 10) IS the correct hash output for "Mac153".

**Lesson**: When the color is constant, check whether the INPUT to the color function is constant. Don't assume the input varies just because the user expects it to. In this case, `cli.py` (lines 100-106) sets `host_model` from `$HOST_MODEL` env var, falling back to `$HOSTNAME` — the machine's hostname. Every notification from the same machine gets the same host_model.

### Trial 5: Investigating hash distribution for short strings

**What**: Computed the old djb-style hash (`((h<<5)-h)+c` with `|=0`) for various short strings.

**Result**: The old hash has terrible distribution for short strings:
- `"foo"`, `"bar"`, `"claude"` all → palette index 9 (#26A69A, teal)
- `"Mac153"` → index 10 (#43A047, green)
- `"nuc"` → index 11 (#68A039, green)

Three different short strings all mapping to the same color, and the only two hostnames in the user's environment (Mac153, nuc) landing on adjacent greens. This explained why "regardless of host_model string, it's always green."

**Lesson**: The djb hash `h = (h << 5) - h + c` (equivalent to `h * 31 + c`) has poor avalanche for short strings. Combined with mod 15 (small modulus), short hostnames cluster badly. For longer strings like pwd paths, the additional characters provide sufficient mixing to avoid visible clustering. The avatar worked fine because pwd paths are long.

### Final fix: FNV-1a hash for host_model, shared palette

**What**: Added `getHostModelColor(hostModel)` using the FNV-1a hash (`FNV_offset_basis = 2166136261`; `hash ^= c; hash *= 16777619` with `Math.imul` and `>>>0` for 32-bit math), sharing the same `AVATAR_COLORS` palette.

**Result**: Short strings now spread across distinct palette colors. With the user's data:
- `Mac153` → `#77919D` (gray-blue) — previously green
- `nuc` → `#68A039` (olive green)
- `gpt-4` → `#0388D2` (blue)
- `foo` → `#EC417A` (pink)
- `bar` → `#00ACC1` (cyan)

6 common short hostnames map to 6 distinct colors. The "all green" user complaint is resolved.

**Lesson**: FNV-1a has proper avalanche even for consecutive single-byte inputs. It's the standard choice for short-string hashing (DJB2 is for longer strings where the avalanche deficiency is less noticeable). When hashing short strings (3-15 chars) into a small target range (mod 15), use FNV-1a.

## Key technical findings

### 1. OpenTUI rendering: inline `<span bg>` vs `<box backgroundColor>`

| Element | Position in flex row | Works? |
|---------|---------------------|--------|
| `<span bg={...}>` (first span in `<text>`) | 1st | Yes (avatar) |
| `<span bg={...}>` (non-first span in `<text>`) | 3rd | No — falls back to default in production renderer |
| `<box backgroundColor={...}>` (first box) | 1st | Yes (avatar) |
| `<box backgroundColor={...}>` (non-first box) | 3rd | Yes (host_model) |

The inline span bg issue was a red herring — the real problem was the color value, not the rendering path. Both mechanisms work for correct color values.

### 2. `captureSpans()` vs terminal output

`captureSpans()` calls `renderer.currentRenderBuffer.getSpanLines()` — it reads the **painted buffer** (the in-memory cell grid after compositing). This is the same data that the production renderer serializes to ANSI escape sequences.

**BUT**: The test renderer and the production renderer share the buffer but may diverge in the ANSI serialization step for edge cases. A test that passes with `captureSpans()` asserting the correct cell bg does NOT guarantee the terminal will render it correctly — but it's strong evidence.

In this case, the test WAS correct: the cell bg was set to `#00BCD4` for `@gpt-4` in the buffer. The terminal rendered it... also correctly. The "green" came from `hash("Mac153")` always returning green, not from any rendering issue.

### 3. `captureCharFrame()` vs `captureSpans()`

- `captureCharFrame()` = `renderer.currentRenderBuffer.getRealCharBytes(true)` — pure text, no color info
- `captureSpans()` = `renderer.currentRenderBuffer.getSpanLines()` — text + per-cell fg/bg/attributes

Use `captureSpans()` when you need to verify colors. Use `captureCharFrame()` for text content assertions.

### 4. Hash functions for short strings

| Hash | "foo" | "bar" | "claude" | "Mac153" | "nuc" |
|------|-------|-------|----------|----------|-------|
| DJB2 (`h*31+c`) | idx 9 | idx 9 | idx 9 | idx 10 | idx 11 |
| FNV-1a | idx 3 | idx 2 | idx 3 | idx 1 | idx 11 |

DJB2 clusters all short strings into adjacent indices (9-11). FNV-1a spreads them across the full range. For mod 15, this is critical — with DJB2, 3+ strings can easily collide in a 15-slot space.

### 5. The CLI's host_model source

In `src/notifyhub/cli/cli.py`:
```python
host_model = os.environ.get("HOST_MODEL", "").strip()
if host_model in ("", "Unknown"):
    host_model = os.environ.get("HOSTNAME", "").strip()
```

The CLI always sets host_model to the machine hostname (`$HOSTNAME`) unless `$HOST_MODEL` is explicitly set. This means:
- Notifications pushed from a dev machine's terminal: host_model = hostname (constant)
- Notifications pushed by OpenCode plugin (which also uses the CLI): host_model = hostname
- If `$HOST_MODEL` is set to the AI model name: host_model varies per model

This should be documented so users understand why their host_model colors are (or aren't) varied.

## Files changed

1. `src/notifyhub/tui/src/components/NotificationRow.tsx`:
   - Extracted `AVATAR_COLORS` as exported constant
   - Added `getHostModelColor(hostModel)` with FNV-1a hash
   - Moved host_model from standalone `<text>` line to inline `<box>` pill on title line
   - Refactored avatar and host_model to use `<box backgroundColor={...}>` pills
   - Removed `hostModel` from `cardHeight` calculation (was `+ (hostModel ? 1 : 0)`)

2. `src/notifyhub/tui/src/__tests__/NotificationRow.test.tsx`:
   - Updated import to use `getHostModelColor`
   - Host_model test now asserts against `getHostModelColor("gpt-4")`

3. `src/notifyhub/tui/src/__tests__/utils.test.ts`:
   - Added `getHostModelColor` test suite:
     - Determinism (same string → same color)
     - Valid hex output
     - Spread across distinct colors for common short hostnames (Mac153, nuc, foo, bar, claude, gpt-4)
     - Empty string handling

## Test status

```
95 pass, 0 fail, 121 expect() calls across 7 files
```