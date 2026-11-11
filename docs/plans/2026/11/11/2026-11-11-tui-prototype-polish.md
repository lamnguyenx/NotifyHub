# TUI: prototype polish and waiting-card finish

**Date**: 2026-11-11
**Status**: Done (154 tests pass)
**Modules**: `src/notifyhub/tui/` parent (theme, Makefile/package scripts, docs); submodules
`src/components/`, `src/prototypes/`, `src/__tests__/`.

## Module map

| Module | Plan |
|---|---|
| `src/notifyhub/tui/` (parent) | this doc — watch mode, `r` restart, theme tokens, docs |
| `src/notifyhub/tui/src/components/` | [`2026-11-11-tui-prototype-polish-components.md`](2026-11-11-tui-prototype-polish-components.md) |
| `src/notifyhub/tui/src/prototypes/` | [`2026-11-11-tui-prototype-polish-harness.md`](2026-11-11-tui-prototype-polish-harness.md) |
| `src/notifyhub/tui/src/__tests__/` | [`2026-11-11-tui-prototype-polish-tests.md`](2026-11-11-tui-prototype-polish-tests.md) |

## Goal

The prototype harness had become the place to tune the TUI, but every edit required a manual
restart. This session made the prototype a real design loop and finished the waiting-card look:

- `make tui-prototype` hot-reloads by default (Bun watch mode).
- `r` resets the prototype to a fresh launch without leaving the terminal.
- The running card's `loading` status moved to the card's bottom-right corner.
- The loading word shimmers and uses a Claude Code-style per-turn gerund, not a fast carousel.
- Permission waits and stalled sessions no longer share the same yellow.
- Docked waiting cards are tighter and carry a faint state-colored background.
- Normal feed cards use a quieter gray border; selected cards remain accent-colored.

## What changed

### Parent module

- `Makefile` — `tui-prototype` now runs `bun --watch src/prototype.tsx`.
- `package.json` — `prototype` watches; `prototype:once` is the old one-shot command.
- `src/theme.tsx` — new `cardBorder` token:
  - dark `#808080`
  - light `#c0c0c0`
  - `border` stays for popups; `borderSelected` stays for the selected card.
- Root `README.md` §16, `src/notifyhub/tui/README.md`, `docs/important/the-tui.md`,
  `docs/important/tui-rendering-rules.md`, `docs/important/tui-testing-guide.md`,
  `docs/important/agent-status.md`, and `docs/_meta/how-to-prototype.md` were swept for the new
  behavior.

### Submodules

- `components/` — waiting-card layout, animation, status colors, tint, gap; normal-card border.
- `prototypes/` — watch-mode tooling, `r` restart, forever-loading fixtures, stalled fixture.
- `__tests__/` — alignment, word stability, shimmer, semantic colors, tint, border, restart.

## Design decisions

- **`bun --watch`, not `bun --hot`.** Bun's hot mode re-evaluates modules, but it is not React
  Fast Refresh. A reused OpenTUI root crashed React (`resolveDispatcher().useState` was null).
  Watch mode's hard restart is reliable for a full-screen terminal app.
- **`r` is a harness remount, not a new process.** It resets scenario, clock, deletions, pending
  loads, popups, selection and scroll. The process restart remains the file-save path under
  `--watch`.
- **One ticker.** The spinner, text shimmer and layout share a single 120 ms interval per card.
  The word itself is not tick-driven.
- **One gerund per turn.** The word is hashed from `session_id + task excerpt`. A new prompt
  changes the excerpt and therefore the word; a running turn keeps the same word. This matches
  Claude Code's per-turn whimsical status instead of a rotating carousel.
- **Semantic state colors.** `blocked` is a permission/input request (amber, `⚠`); `stale` is a
  client-side "no refresh in 5 minutes" inference (red, `◼`). They no longer look alike.
- **Subtle state wash.** Waiting-card background is
  `mixHex(borderColor, theme.background, 0.1)`. The tint follows the border/state without
  competing with text or pills.
- **Separate normal-card border token.** `cardBorder` lets the feed recede while popups keep their
  brighter `border`. The first gray (`#555555`) was too heavy; the final `#808080` is a softer
  middle ground.

## Trials, errors and lessons

### `bun --hot` is not browser-style HMR

The first attempt put the renderer/root on `globalThis` so Bun `--hot` could re-evaluate the
entrypoint without setting up the terminal twice. Editing a scenario then rendered:

```text
TypeError: null is not an object (evaluating 'resolveDispatcher().useState')
```

The module re-evaluation replaced React component identities while the existing reconciler still
held the old dispatcher. Reusing the root did not make the reload React-safe.

**Lesson**: Bun `--hot` is a server-side soft reload, not React Fast Refresh. For a TUI with a
live renderer, watch-mode restart is the supported, reliable path. Test the reload story in a
real tmux pane; the typechecker cannot see dispatcher state.

### Watch restart resets demo state

`bun --watch` fixed the edit loop but clears the selected scenario and frozen clock on every save.
That is acceptable for code reload but annoying while comparing scenarios. `r` was added as a
deliberate state reset and remount.

**Lesson**: separate "reload code" from "reset UI state". The watcher owns the former; the
harness owns the latter.

### The first `r` implementation is a remount, not a process relaunch

`r` increments a key on `AppView` and clears harness state. It closes popups and resets scroll and
selection, which feels like a restart, but it does not restart Bun. A true process restart would
need a supervisor loop or a file-touch trick against the watcher.

**Lesson**: name the behavior honestly. `r` is a fresh harness launch; file saves are the process
restart.

### The gray border overshot

The first normal-card gray was `#555555`. It was too heavy against black and too close to a
disabled look. The final palette is `#808080` on dark and `#c0c0c0` on light.

**Lesson**: a "subtle" border needs a preview on both themes, not just a luminance guess. Keep a
separate token (`cardBorder`) so the experiment does not drag popups along.

### The waiting-card stack was wasting rows

With three waiting cards, `gap={1}` spent two blank rows between docked cards. `gap={0}` lets the
rounded borders touch and returns those rows to the feed; `marginBottom={1}` still separates the
stack from the stream.

**Lesson**: in a terminal, one row is expensive. A card's own border is enough separation for a
dense, pinned stack.

## Verification

- `make tui-test` — **154 pass, 0 fail, 243 expect calls, 11 files**.
- `make tui-typecheck` — only the documented pre-existing `bun:test`/Node/CliRenderer errors.
- tmux checks:
  - editing a scenario restarted the watch-mode prototype;
  - `r` returned `PROTOTYPE 2/7 · time frozen` with Help open to
    `PROTOTYPE 1/7 · time live` with no popup;
  - the loading word stayed fixed while the spinner advanced;
  - `waiting for you ⚠` rendered `#ffcc00`, `stalled? ◼` rendered `#ff5555`;
  - waiting-card washes were `#0b1416`, `#1a1400`, `#1a0909` against black;
  - normal card borders rendered `#808080`.
- `git diff --check` clean.

## Related

- Components: [`2026-11-11-tui-prototype-polish-components.md`](2026-11-11-tui-prototype-polish-components.md)
- Harness: [`2026-11-11-tui-prototype-polish-harness.md`](2026-11-11-tui-prototype-polish-harness.md)
- Tests: [`2026-11-11-tui-prototype-polish-tests.md`](2026-11-11-tui-prototype-polish-tests.md)
- Prototype mode: [`2026-11-11-tui-prototype-mode.md`](2026-11-11-tui-prototype-mode.md)
- Waiting cards: [`2026-11-11-tui-waiting-cards.md`](2026-11-11-tui-waiting-cards.md)
- Operator guide: [`docs/important/the-tui.md`](../../../../../docs/important/the-tui.md)
