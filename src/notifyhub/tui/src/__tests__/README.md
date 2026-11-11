# TUI Tests

Bun's built-in runner (`bun test`) with OpenTUI's in-memory test renderer. No Vitest, Jest,
Playwright or TTY is involved.

```bash
make tui-test                  # from the repo root
cd src/notifyhub/tui && bun test  # equivalent
```

Current: **154 pass, 0 fail, 11 files**.

## Suites

| File | Covers |
|---|---|
| `App.test.tsx` | Layout, footer hints, popup toggles/mutual exclusion, dismissal |
| `NotificationRow.test.tsx` | Card text, avatar, title, pwd, timestamp, host-model color, gray/selected border, LOCKED rows |
| `NotificationStream.test.tsx` | Empty state, rendering, select mode, navigation, delete |
| `WaitingCards.test.tsx` | Waiting-card chrome, right-aligned gerund + spinner, shimmer, blocked/stalled colors, tinted backgrounds, idle hiding |
| `StatusPopup.test.tsx` | Connection/SSE/e2e rows, host:port, locked count |
| `HelpPopup.test.tsx` | Heading, key bindings, dismiss instruction |
| `layout.test.tsx` | Real column composition: waiting card, stream, footer at 60×20 |
| `Prototype.test.tsx` | Mock overview, scenario switching/number keys, frozen clock, `r` restart, forever/stalled fixtures |
| `crypto.test.ts` | Envelope decryption, key resolution, locked rows |
| `utils.test.ts` | Time formatting, tags, truncation, colors, API base URL, SSE parser |
| `ErrorBoundary.test.tsx` | Fallback rendering (the thrown error is logged by the runner) |

## Conventions

- Use `testRender(<Component …>, { width, height })` + `captureCharFrame()`; never call a
  component as a function.
- `pressKey()` + **two** `renderOnce()` calls, both inside `act()`:

```tsx
mockInput.pressKey("v")
await act(async () => { await renderOnce() }) // process the key event
await act(async () => { await renderOnce() }) // render the state change
```

- `captureSpans()` for per-cell colors/attributes; `rgbToHex()` from `@opentui/core` converts
  `RGBA`. Use it for semantic colors, the card tint and border shades; text spans inherit the
  card background, so the tint is observable there.
- The loading word is seeded per turn, not fixed. Derive the expected value with
  `loadingWordFor(seed)` instead of asserting the literal `loading`.
- Mock `globalThis.fetch` when rendering the full `App` (`/api/notifications`, `/api/e2e`,
  `/events`), or the test will hit the real backend if it is running.
- Assert **unique** strings. For popups, use full titles (`NotifyHub — Help`,
  `NotifyHub — Status`) or the first and last content rows; a bare `toContain("Status")` can pass
  because of an overlap bug.
- For fixed-height popups, assert the last content row (`Press any key to close`,
  `Locked rows:`) — otherwise a too-small height goes unnoticed.
- Escape sequences in JSX text are literal. If a frame shows `\u2014`, fix the source with
  `<text>{"\u2014"}</text>`, then assert the real glyph.
- Call `renderer.destroy()` at the end of every test.
- Waiting cards are **seven rows** (border, header, time, pwd, `@USER`, `@ASSISTANT`, border)
  plus a one-row margin before the stream. A layout test with one card needs at least 9 rows
  above the stream; the
  committed composition uses 60×20. Assert the card's row indices (1, 3, 4, 5), not just
  `toContain`, so an overlapping stream is visible.
- The per-card ticker (`useTicker`, 120 ms) causes React `act(...)` warnings in the in-memory
  renderer. It drives the spinner, shimmer and status updates; the assertions still pass. If the
  noise becomes a problem, use fake timers rather than removing the ticker.

## What the tests cannot catch

The renderer is an in-memory grid. It does not catch:

- terminal-specific color/span divergence (`captureSpans()` can differ from the terminal);
- popup overlap at a real terminal size unless you assert every row;
- resize behavior;
- exit status / hung processes.

Verify those in a detached tmux pane: run the TUI, drive the keys, capture the pane, and check the
process exits with code 0.

## Adding a test

1. Put it in this directory, named after the unit (`Foo.test.tsx`).
2. Prefer a pure-function test when possible (`utils.test.ts` needs no renderer).
3. For rendering, assert a specific row index or a unique line; dump
   `index + JSON.stringify(line)` when debugging a frame.
4. For popups, assert both the first and last content rows.
5. Run `make tui-test` and keep the suite at 154+ passing.

## Related

- [Prototype polish — parent plan](../../../../../docs/plans/2026/11/11/2026-11-11-tui-prototype-polish.md)
- [Prototype polish — components](../../../../../docs/plans/2026/11/11/2026-11-11-tui-prototype-polish-components.md)
- [Prototype polish — harness](../../../../../docs/plans/2026/11/11/2026-11-11-tui-prototype-polish-harness.md)
- [Prototype polish — tests](../../../../../docs/plans/2026/11/11/2026-11-11-tui-prototype-polish-tests.md)
- [Waiting cards — parent plan](../../../../../docs/plans/2026/11/11/2026-11-11-tui-waiting-cards.md)
- [Waiting cards — component plan](../../../../../docs/plans/2026/11/11/2026-11-11-tui-waiting-cards-component.md)
- [Waiting cards — tests plan](../../../../../docs/plans/2026/11/11/2026-11-11-tui-waiting-cards-tests.md)
- [Waiting card machine ID](../../../../../docs/plans/2026/11/11/2026-11-11-tui-waiting-card-machine-id.md)
- [Machine-ID tests](../../../../../docs/plans/2026/11/11/2026-11-11-tui-waiting-card-machine-id-tests.md)
- [Prototype mode](../../../../../docs/plans/2026/11/11/2026-11-11-tui-prototype-mode.md) ·
  [`harness`](../../../../../docs/plans/2026/11/11/2026-11-11-tui-prototype-mode-harness.md) ·
  [`tests`](../../../../../docs/plans/2026/11/11/2026-11-11-tui-prototype-mode-tests.md) ·
  [`how-to-prototype`](../../../../../docs/_meta/how-to-prototype.md)
- [Testing guide](../../../../../docs/important/tui-testing-guide.md)
- [Rendering rules](../../../../../docs/important/tui-rendering-rules.md)
- [Test-assertion plan](../../../../../docs/plans/2026/11/11/2026-11-11-tui-tests-popup-assertions.md)
