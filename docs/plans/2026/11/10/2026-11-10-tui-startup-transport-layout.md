# TUI startup, transport and layout fixes

**Date**: 2026-11-10
**Status**: Done (verified live against the nuc funnel)
**Parent**: [`2026-11-10-agent-status-live-broadcast.md`](2026-11-10-agent-status-live-broadcast.md) —
follow-up session after `b0d1766` ("Add live agent status reporting and TUI dock").

Module: `src/notifyhub/tui/` (plus the root README and the operator guides under `docs/important/`).

Per-module docs:

| Module | Plan doc |
|---|---|
| connection / `utils/api.ts` scheme | [`2026-11-10-tui-connection-scheme.md`](2026-11-10-tui-connection-scheme.md) |
| SSE parser / `utils/api.ts` | [`2026-11-10-tui-sse-parser.md`](2026-11-10-tui-sse-parser.md) |
| dock display / `components/AgentStatusDock.tsx` | [`2026-11-10-tui-dock-display.md`](2026-11-10-tui-dock-display.md) |
| stream/dock layout / `App.tsx` + `NotificationStream.tsx` | [`2026-11-10-tui-stream-layout.md`](2026-11-10-tui-stream-layout.md) |

## Goal

Continue the agent-status work from `b0d1766` by fixing four TUI problems reported one after
another:

1. the dock rendered the running **task text**, which the user does not want;
2. `make tui` did not connect to the HTTPS Tailscale-funnel backend;
3. closing and reopening the TUI lost all notification history;
4. once history loaded, the dock/layout was corrupted — stream text interfered with the dock.

They looked like four UI issues. They were four different layers: display, URL construction,
transport parsing, and flex layout.

## What changed

| Layer | Change | Files |
|---|---|---|
| Dock display | Rows render status only: marker + agent glyph/label + directory + elapsed. The task excerpt is no longer rendered (the `task` field stays in the API payload). | `components/AgentStatusDock.tsx`, dock test |
| Connection | `getApiBase()` honors `NOTIFYHUB_CLI_SCHEME` (`http`/`https`), normalizes `https://`/case/empty like the CLI, omits default ports 80/443, and falls back to `localhost` for an empty host. | `utils/api.ts`, `utils.test.ts` |
| SSE transport | Replaced the line-based parser with a **block-based** parser that returns the whole incomplete `event:`/`data:` block. The old parser lost the event name when a payload spanned network chunks — the 23 KB `init` event was emitted as `heartbeat` and discarded, so startup history never appeared. | `utils/api.ts`, `utils.test.ts` |
| Layout | The stream's scrollbox used `height="100%"`, so it claimed the full flex area and Yoga shrank the dock by a row. The stream now uses `flexGrow={1}` + `minHeight={0}`; the content column is an explicit column with `minHeight={0}`; the dock is `flexShrink={0}`. | `App.tsx`, `components/NotificationStream.tsx`, `components/AgentStatusDock.tsx`, new `layout.test.tsx` |

## How the issues surfaced

The order mattered: fixing the transport exposed the layout bug.

1. **Dock text** — pure rendering change; no protocol involvement.
2. **No connection** — the shell exported `NOTIFYHUB_CLI_SCHEME=https`,
   `NOTIFYHUB_CLI_HOST=nuc.tail0ec64c.ts.net`, `NOTIFYHUB_CLI_PORT=443`, but the TUI hardcoded
   `http://`. `curl` to the funnel worked, which proved the server/TLS side was fine.
3. **No history on reopen** — the page-size cap (`NOTIFYHUB_TUI_PAGE_SIZE`, default 30) was the
   obvious suspect, but the server had 29 notifications and a live fetch returned all of them.
   A headless run of the real `connectSSE()` showed the actual failure: `init` arrived as a
   `heartbeat` whose data was the concatenated init JSON + heartbeat JSON.
4. **Dock/layout corruption** — only visible now that the stream had content. With 29
   notifications, the dock lost a row (`proj2` vanished) and the stream started flush against the
   dock border. A 60×16 headless render captured the before/after frames.

## Cross-cutting trials, errors and lessons

### Isolate the layer before changing UI code

Three symptoms pointed at three different files. The fastest discriminator was a throwaway
`bun -e` harness importing the *real* TUI modules (`connectSSE`, `fetchNotifications`,
`decryptItems`) against the live funnel. It proved the scheme fix, then exposed the parser bug,
without starting a TUI or touching rendering. Use the app's own transport code in a script — not
curl alone — when the question is "what does the TUI actually receive?".

### The obvious hypothesis (page-size cap) was wrong

The user reasonably suspected the pagination cap. Before changing `PAGE_SIZE`, check the server's
`GET /api/notifications/count` and fetch one page. Here count = init size = 29, which ruled out
both the cap and server retention. The backend store is also RAM-only, so a server restart can
legitimately erase history — separate that from a client-side load failure.

### Live events masked the parser bug

Small `notification` events usually fit in one network chunk, so they worked while `init` did
not. "New notifications appear but history is empty" is a strong signal to look at chunk
boundaries, not at the list/cap logic.

### An empty state can hide a layout bug

With no history, the stream was just the "Waiting for notifications…" placeholder and the dock
looked fine. The `height="100%"` overflow only became visible when 20+ cards rendered. Reproduce
layout defects with a realistic amount of content.

### Tests can encode the bug

The old `parseSSEStream` test asserted that an incomplete event returned only its `data:` line as
the remainder — exactly the behavior that dropped the event name. The expectation had to change
to "the whole incomplete block". When changing parser semantics, update the old tests and add a
test for the failing cross-chunk case.

### Type-check noise is pre-existing

`make tui-typecheck` still fails on missing `@types/node` / `bun:test` declarations and
`CliRenderer.on/off`. The same errors exist on a clean checkout; none were introduced here. Verify
against a stash before treating them as regressions.

## Verification

| Check | Result |
|---|---|
| `make tui-test` | 139 pass, 0 fail (10 files) |
| Live base URL | `https://nuc.tail0ec64c.ts.net` (443 omitted) |
| Live REST | `GET /api/notifications/count` → `26` at the time |
| Live SSE | `init` with 29 items, followed by an independent `heartbeat` |
| Live decrypt | 29 fetched, 0 locked (config `e2e.key`, kid `39163466`) |
| Headless layout | dock rows `proj1/proj2/proj3` intact; stream starts below the dock; footer on the last line |

## Follow-ups

- Surface the resolved base URL (scheme included) in the status popup — a wrong scheme currently
  looks identical to an empty stream because the reconnect loop swallows the error.
- On SSE reconnect, `init` replaces the notification list; pages lazy-loaded before a blip are
  dropped. Consider merging or re-fetching around the `before` cursor.
- The backend notification store is RAM-only; history loss across backend restarts is expected.
- The web frontend still has no agent-status dock (needs a WebCrypto decrypt port), as noted in
  the parent plan.
