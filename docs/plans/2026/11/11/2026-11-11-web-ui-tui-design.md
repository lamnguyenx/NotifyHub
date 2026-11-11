# Web UI: apply the TUI prototype design

**Date**: 2026-11-11
**Status**: Done — typecheck, unit tests, both builds and static render checks pass; live backend
check pending
**Modules**: `src/notifyhub/frontend/` (shell, components, hooks, CSS, prototype harness, tests);
root `Makefile`, `README.md`, `docs/_meta/how-to-prototype.md`.

## Goal

The TUI prototype settled the notification design: bordered cards with a colored project avatar,
a `host_model` pill, relative time, pwd path, tag/truncation rendering, and live waiting cards for
agent sessions. This change applies that design to the web UI and follows the copy-on-write
prototype loop from [`docs/_meta/how-to-prototype.md`](../../../_meta/how-to-prototype.md).

## What changed

### Shell and data boundary

- `src/AppView.tsx` — new presentation shell. It takes plain props (`notifications`, `agentStatus`,
  `serverInfo`, `hasMore`, `loadingMore`, handlers, `now`, `header`, `footerExtra`) and owns only
  popup visibility. `App` wires the live hooks; `PrototypeApp` wires fixtures.
- `src/App.tsx` — now live-data wiring only: `useNotifications` + `useAudio`, page-title/audio
  effects, and `<AppView>`.
- `src/hooks/useNotifications.ts` — SSE (`init`, `notification`, `agent_status`, `delete`, `clear`,
  `heartbeat`, `shutdown`), a 15 s count/e2e poll, `GET /api/status` resync on reconnect, lazy
  `GET /api/notifications?limit=30&before=…`, and single/all delete mutations.
- `src/hooks/useNow.ts` / `src/hooks/useAudio.ts` — shared clock and autoplay-aware sound.
- `src/types.ts` — `NotificationItem`, `AgentStatusEntry`, `ServerInfo`, `E2EInfo`.
- Deleted `src/models/NotificationData.ts`; notifications are now plain wire records.
- `src/notifyhub/backend/backend.py` — production template injection now inserts
  `/static/main.css` before `</head>` instead of matching the removed Bootstrap link, so the
  built stylesheet is still served after `make frontend`.

### Cards and feed

- `components/NotificationCard.tsx` — TUI card: avatar initial from the pwd hash, bold title,
  `host_model` pill, relative timestamp (own row when the pill is present), pwd path, tag and
  truncation rendering, hover delete button. `LOCKED` cards show the envelope `kid`.
- `components/WaitingCards.tsx` — running/blocked/stale cards above the feed: agent + host pills,
  `@USER` task excerpt, `@ASSISTANT` line with a per-turn gerund + braille spinner, amber
  `waiting for you ⚠`, red `stalled? ◼`, and a 10% state-colour wash.
- `components/NotificationStream.tsx` — empty state and an `IntersectionObserver` sentinel that
  lazy-loads older pages; the footer shows the loading state.
- `components/StatusPopup.tsx` / `components/HelpPopup.tsx` — Mantine modals styled with the TUI
  tokens. Status shows connection, streaming, server, count, e2e and locked count.
- `utils/cardUtils.ts` — avatar/pill hashing, title/truncate, tag/truncation parsing, envelope
  detection, stale mirror and the per-turn gerund list (ported from the TUI).
- `utils/timestampUtils.ts` — relative time matching the TUI (`now`, `5m ago`, `Yesterday`,
  `MM/DD/YY`), with an injectable `now` for the prototype.
- `notification.css` / `index.css` — TUI palette as `--nh-*` tokens (dark + light), shell, cards,
  waiting cards, feed, footer, modals and narrow-screen rules. `index.css` imports Mantine's full
  `styles.css` so `Modal`/`Button` component styles are present in production.

### Prototype harness

- `prototype.html` + `src/prototype.tsx` — dev-only entry at `/prototype.html`.
- `src/prototypes/PrototypeApp.tsx` — scenario switcher, frozen clock, `r` restart and a
  harness-only bar; it renders the real `AppView`.
- `src/prototypes/scenarios.ts` — the seven TUI scenarios (overview, waiting states, waiting edge
  cases, cards, e2e/locked, empty/offline, many/pagination).
- `src/prototypes/prototype.css` — harness chrome only; never imported by the app.
- `make frontend-prototype` (`make fp`) → `bun run prototype` (`vite --open /prototype.html`).

### Tests and tooling

- `utils/timestampUtils.test.ts` and `utils/cardUtils.test.ts` — Bun tests for the ported helpers.
- `tsconfig.json` + `src/vite-env.d.ts` — `tsc --noEmit` for the frontend.
- Removed unused `framer-motion`, `crypto-js`, `@types/crypto-js` and `@mantine/dates` deps.
- Removed the Bootstrap CDN from `index.html`; the app is fully Mantine + custom CSS.

## Design decisions

- **Mirror the TUI, not the old Apple-style cards.** The fan-in compression and per-card scroll
  listeners are gone. Cards are flat, bordered and content-measured; the dark palette matches the
  TUI (`#0a0a0a` page, `#000` cards, `#808080` border, `#6fc3df` accent).
- **Keep Mantine for the shell, not the cards.** Mantine supplies the provider, modals and icons;
  the card markup is plain HTML/CSS so the TUI tokens are the single source of truth.
- **Keep browser `EventSource`.** The TUI uses a manual fetch/ReadableStream parser because Bun
  has no `EventSource`; the browser does, and its reconnection behaviour is what we want. The
  event names and payload shapes are identical.
- **Web shows `LOCKED`, it does not decrypt.** e2e decryption stays a TUI feature. The web card
  shows the envelope `kid`, and the status popup explains that the TUI is needed to read it.
- **Mouse-first deletion.** The TUI needs select mode because terminals have no hover; the web
  card shows a `×` on hover/focus and keeps the `l`/`s`/`h` keyboard shortcuts as a bonus.
- **`color-mix` for tints.** Waiting-card washes and pill colours mix the state/host colour with
  the card/page token, so dark and light themes both work without hard-coded hex blends.
- **Audio keys off `liveEventSeq`.** Keying off `notifications.length` played the sound when an
  older page was appended; the hook now increments a sequence only for live SSE arrivals.

## Trials and lessons

- **Broken `node_modules` symlink.** `bun run build` failed with `vite: command not found` even
  though `.bin/vite` existed; the package directory was missing. `bun install` repaired it.
- **`Yesterday` beats `23h ago`.** The TUI formatter checks the calendar day before the hour
  bucket, so a 23-hour-old timestamp from yesterday renders `Yesterday`. The unit test documents
  that behaviour instead of asserting the old web formatter's `23h ago`.
- **Sticky chrome can stack.** The prototype bar was initially sticky at `top: 0` and covered the
  sticky waiting stack. The bar is now static; the waiting stack keeps `top: 0`.
- **Prototype build is separate.** `vite build` only includes `src/main.tsx`; `prototype.html` is
  served by the dev server. A temporary multi-entry build verified the harness compiles.
- **Global Mantine CSS is not enough for `Modal`.** The old app imported only
  `styles/global.css`, `baseline.css` and `default-css-variables.css`; the modal rendered with a
  giant unstyled close icon. Importing `@mantine/core/styles.css` brings the component CSS and
  fixes the popups (CSS grows from ~34 KB to ~210 KB, ~31 KB gzip).
- **The backend injected CSS via Bootstrap.** Removing the Bootstrap CDN broke production styling
  because `load_and_transform_template()` looked for the Bootstrap link. It now inserts
  `/static/main.css` before `</head>`, with a regression test.

## TUI parity

The TUI main app was already the prototype's real code: `prototypes/PrototypeApp.tsx` imports
`AppView` from `../App`, and `AppView` renders the same `WaitingCards`, `NotificationStream`,
`NotificationRow`, `StatusPopup` and `HelpPopup` that `App` wires to live SSE. There is no seam to
delete and no second card implementation. `make tui-test` — **154 pass, 0 fail, 243 expect calls,
11 files** — covers the app shell, waiting cards, card rendering, popups, layout and the prototype
harness. `make tui-typecheck` still reports the documented pre-existing `bun:test`/Node/CliRenderer
errors only.

The web port deliberately reuses that design rather than inventing a second one.

A tmux capture of `bun src/prototype.tsx` confirmed the real `AppView` output: the overview shows
three state-colored waiting cards (accent/amber/red) above the feed, scenario 2 shows the running
gerund + spinner and `waiting for you ⚠`, scenario 5 shows the `LOCKED` rows, and `s` opens the
content-sized status popup with the funnel `host:port` and e2e/locked counts.

## Verification

- `cd src/notifyhub/frontend && ./node_modules/.bin/tsc --noEmit -p .` — clean.
- `cd src/notifyhub/frontend && bun test` — **16 pass, 0 fail, 27 expect calls**.
- `cd src/notifyhub/frontend && bun run build` — succeeds (`static/app.js`, `static/main.css`).
- Prototype entry build (`prototype.html` input) — succeeds.
- Static Playwright render of the prototype (`prototype.html`, no server): overview has 3 waiting
  cards + 8 notifications, 3 locked cards in scenario 5, status modal opens, empty/offline and
  30-card scenarios render, no console errors; 390px-wide screenshot wraps correctly.
- Static Playwright render of the real app (`static/app.js` + mocked SSE/REST): 3 notifications,
  2 waiting cards, 1 locked card, status modal, and hover-delete all work.
- Backend: `make test-backend` — **216 pass, 3 pre-existing failures** in
  `tests/notifyhub/test_config.py` because the local `~/.config/notifyhub/config.jsonl` sets
  `notifications_max_count=1000`; the root/HTML tests pass and the template now emits
  `/static/main.css`.
- Live backend check (`make backend` + `make frontend-hotload`) — pending user confirmation; the
  static checks cover the same shell with mocked events. **Restart the backend** after this change
  so the production template injection picks up `/static/main.css`.

## Related

- Prototype rules: [`docs/_meta/how-to-prototype.md`](../../../_meta/how-to-prototype.md)
- TUI design: [`docs/important/the-tui.md`](../../../important/the-tui.md)
- TUI prototype polish: [`2026-11-11-tui-prototype-polish.md`](2026-11-11-tui-prototype-polish.md)
- Web prototype README: [`src/notifyhub/frontend/src/prototypes/README.md`](../../../../src/notifyhub/frontend/src/prototypes/README.md)
