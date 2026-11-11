# NotifyHub TUI

Terminal client for NotifyHub, built with React + [OpenTUI](https://opentui.dev) and run with Bun.
It connects to the NotifyHub backend over SSE, decrypts e2e payloads locally, and renders a live
notification feed with waiting notification cards for in-flight coding-agent sessions.

Operator guide: [`docs/important/the-tui.md`](../../../docs/important/the-tui.md) ·
Rendering invariants: [`docs/important/tui-rendering-rules.md`](../../../docs/important/tui-rendering-rules.md) ·
Testing guide: [`docs/important/tui-testing-guide.md`](../../../docs/important/tui-testing-guide.md)

## Quick start

```bash
make tui-deps      # cd src/notifyhub/tui && bun install
make tui           # bun src/index.tsx (backend must be on :9080)
make tui-prototype # bun src/prototype.tsx (mock data, no backend)
make tui-test      # bun test
make tui-typecheck # tsc --noEmit (see "Typecheck" below)
```

The backend can be reached through a Tailscale funnel: set `NOTIFYHUB_CLI_SCHEME=https`,
`NOTIFYHUB_CLI_HOST`, and `NOTIFYHUB_CLI_PORT=443`. The TUI uses the same env vars as the CLI.

## Features

- **Live feed** — `init` snapshot, then SSE `notification` / `delete` / `clear` events.
  `NOTIFYHUB_TUI_PAGE_SIZE` (default 30) caps the snapshot; scroll to the bottom or press `l` to
  load older pages. The 15-second status poll only fetches the count.
- **Select mode** (`v`) — `j`/`k` or arrows move the selection, `PgUp`/`PgDn` move by five,
  `Home`/`End` jump to the ends, `Delete`/`Backspace` deletes, `Esc` deselects. The selection is
  kept on-screen and the banner is pinned.
- **Cards** — colored avatar from the pwd hash, title, full pwd, message with tag/truncation
  highlighting, host-model pill, relative timestamp. Cards measure their content; there is no
  fixed height.
- **Waiting cards** — running/blocked/stalled sessions from `agent_status` events render as
  notification cards above the feed: the running prompt as `@USER`, a live `@ASSISTANT loading`
  line (braille spinner), the coding-agent pill, the reporting machine's host pill
  (`⌂ Mac153`), and a client-side stale mirror (5 min).
- **Status popup** (`s`) and **help popup** (`h`/`?`) — content-sized overlays; see
  `components/`.
- **E2E decryption** — AES-256-GCM envelopes are decrypted locally (`utils/crypto.ts`). A row that
  cannot be decrypted renders as `LOCKED` with the envelope `kid`.
- **Prototype mode** (`make tui-prototype`) — the real `AppView` and cards against fake scenarios:
  waiting states, card variants, locked rows, empty/offline and pagination. No backend, no SSE, no
  e2e key. Keys `1`–`7`/`n`/`p` switch scenarios; `t` freezes relative time. Rules:
  [`docs/_meta/how-to-prototype.md`](../../../docs/_meta/how-to-prototype.md).

## Layout

```text
src/notifyhub/tui/
├── package.json / tsconfig.json
├── src/
│   ├── index.tsx          # mounts App through renderTui()
│   ├── prototype.tsx      # mounts PrototypeApp through renderTui()
│   ├── render.tsx         # createCliRenderer + ThemeProvider + onDestroy exit
│   ├── App.tsx            # AppView shell + App live-data wiring
│   ├── theme.tsx          # DARK_THEME / LIGHT_THEME + ThemeProvider
│   ├── types.ts
│   ├── hooks/             # useNotifications, useNow, useAudio
│   ├── utils/             # api.ts (REST + SSE), crypto.ts (WebCrypto)
│   ├── components/        # stream, cards, waiting cards, popups, error boundary
│   ├── prototypes/        # harness, scenarios and (temporary) seams
│   └── __tests__/         # bun test suites
└── exp/                   # scratch captures from debugging sessions
```

## Keyboard

| Key | Action |
|---|---|
| `v` | Toggle select mode |
| `j`/`k` or `↑`/`↓` | Move selection (select mode) |
| `PgUp`/`PgDn` | Move by five (select mode) |
| `Home`/`End` | First/last (select mode) |
| `Delete`/`Backspace` | Delete selected card (select mode) |
| `Esc` | Deselect |
| `↑`/`↓`/`←`/`→` | Scroll feed (select mode off) |
| `l` | Load older page |
| `s` | Status popup |
| `h`/`?` | Help popup |
| `q` | Quit (exit code 0) |
| `Ctrl+C` | Quit via renderer `onDestroy` |
| `Ctrl+Z` | Suspend; `SIGCONT` resumes |

## Rendering invariants (read before editing a component)

1. **No hooks after an early return.** `NotificationRow` is a hook-free dispatcher; locked and
   plain cards are separate components.
2. **No fixed card height.** Use `flexShrink={0}` inside the scrollbox and let Yoga measure;
   `wrapMode="none"` for title/pwd.
3. **Popup height = content + gaps + padding + border.** Help is 18 rows, Status 17. Too small a
   height overlaps rows (`Helpu(thisupopup)`) rather than clipping.
4. **Escapes go in expressions:** `<text>{"NotifyHub \u2014 Help"}</text>`. Raw `\u2014` in JSX
   text renders literally.
5. **Banner is a sibling of the scrollbox**, not its first child.
6. **Scroll by renderable id** with `scrollChildIntoView()` after layout.
7. **Quit must call `process.exit(0)`**; `renderer.destroy()` alone leaves SSE/timers alive.

Full explanations: [`docs/important/tui-rendering-rules.md`](../../../docs/important/tui-rendering-rules.md).

## Testing

```bash
make tui-test   # 146 pass, 11 files
```

Use `testRender()` + `captureCharFrame()`; press keys twice through `renderOnce()` inside `act()`.
Assert unique strings (popup titles) and the first **and last** row of fixed-height popups. Mock
`globalThis.fetch` when rendering `App`. Details and pitfalls:
[`docs/important/tui-testing-guide.md`](../../../docs/important/tui-testing-guide.md).

Live check: run the TUI against the backend in a detached tmux pane, drive the keys, and capture
the pane. Unit tests do not catch popup overlap, terminal resize, or exit-status problems.

## Typecheck

`make tui-typecheck` reports pre-existing error classes: missing `bun:test`/Node type
declarations, `CliRenderer.on/off` in `theme.tsx`, and an old `ErrorBoundary` test. The new
`process.exit` calls add instances of the existing missing-Node-types error, not a new category.
Compare against `HEAD` before treating a type error as a regression.

## Debugging checklist

| Symptom | Likely cause |
|---|---|
| `Rendering error: …` | Hook order changed (branch before a hook) or a render threw; test the component directly for the stack |
| Words run together / lines missing in a popup | `popupH` too small; Yoga overlaps rows |
| Literal `\u2014` / `\u2191` on screen | Escape in JSX text instead of `{"…"}` |
| Blank padding or clipped card after resize | Hand-computed `height`; remove it and use `flexShrink={0}` |
| `MaxListenersExceededWarning` | Per-card `useTerminalDimensions()`; only containers should subscribe |
| `q` blanks the screen but shell never returns | Missing `process.exit(0)` / `onDestroy` |
| Selection moves off-screen | Missing id or `scrollChildIntoView()` effect |
| Marker glued to text (`+24 LINES+517 CHARSyou…`) | Marker whitespace not owned; see rendering rules §5 |

## History

- [2026-11-11 prototype mode](../../../docs/plans/2026/11/11/2026-11-11-tui-prototype-mode.md)
  — `make tui-prototype`, `AppView`, scenario harness
- [2026-11-11 prototype harness](../../../docs/plans/2026/11/11/2026-11-11-tui-prototype-mode-harness.md)
  — `prototypes/PrototypeApp.tsx`, `scenarios.ts`
- [2026-11-11 prototype tests](../../../docs/plans/2026/11/11/2026-11-11-tui-prototype-mode-tests.md)
  — `Prototype.test.tsx`
- [2026-11-11 waiting notification cards](../../../docs/plans/2026/11/11/2026-11-11-tui-waiting-cards.md)
  — parent: App wiring, dock removal, behavior
- [2026-11-11 waiting card component](../../../docs/plans/2026/11/11/2026-11-11-tui-waiting-cards-component.md)
  — `components/WaitingCards.tsx`
- [2026-11-11 waiting card tests](../../../docs/plans/2026/11/11/2026-11-11-tui-waiting-cards-tests.md)
  — `WaitingCards.test.tsx`, `layout.test.tsx`
- [2026-11-11 waiting card machine ID](../../../docs/plans/2026/11/11/2026-11-11-tui-waiting-card-machine-id.md)
  — host pill on waiting cards
- [2026-11-11 machine-ID component](../../../docs/plans/2026/11/11/2026-11-11-tui-waiting-card-machine-id-component.md)
  — `⌂` host pill in `WaitingCards.tsx`
- [2026-11-11 machine-ID tests](../../../docs/plans/2026/11/11/2026-11-11-tui-waiting-card-machine-id-tests.md)
  — host/null-host assertions plus backend/CLI/plugin coverage
- [2026-11-11 render, popup and lifecycle fixes](../../../docs/plans/2026/11/11/2026-11-11-tui-render-popup-lifecycle.md)
- [2026-11-11 component changes](../../../docs/plans/2026/11/11/2026-11-11-tui-components-cards-popups.md)
- [2026-11-11 test assertions](../../../docs/plans/2026/11/11/2026-11-11-tui-tests-popup-assertions.md)
- [2026-11-10 startup, transport and layout](../../../docs/plans/2026/11/10/2026-11-10-tui-startup-transport-layout.md)
