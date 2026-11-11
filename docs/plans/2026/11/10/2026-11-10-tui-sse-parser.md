# TUI SSE parser: keep the event name across chunks

**Date**: 2026-11-10
**Status**: Done (verified live against the nuc funnel)
**Parent**: [`2026-11-10-tui-startup-transport-layout.md`](2026-11-10-tui-startup-transport-layout.md)

Module: `src/notifyhub/tui/src/utils/api.ts` (`parseSSEStream`, `connectSSE`) + `utils.test.ts`.

## Symptom

Closing and reopening the TUI showed no notification history, even though the server had 29
notifications and `GET /api/notifications` returned them. New notifications arriving while the
TUI was open still appeared, which made the page-size cap look like the culprit.

## Root cause

`parseSSEStream` was line-based and kept only the unfinished **line** as the remainder:

```ts
const lines = buffer.split("\n")
const remainder = lines.pop() ?? ""
let currentEvent = ""
let currentData = ""
// ...
return remainder
```

Parser state (`currentEvent`, `currentData`) lives only inside one call. The `init` `data:` line
is ~23 KB, so it always spans several `reader.read()` chunks:

```text
chunk 1:  event: init\r\n
          data: [{"id": "2026...        ← partial line, returned as remainder
chunk 2:  <continuation>                  ← remainder, still no newline
chunk 3:  <continuation>
chunk 4:  <continuation>
chunk 5:  <continuation>}]\r\n
          \r\n
          event: heartbeat\r\n
          data: {"timestamp": ...}\r\n
          \r\n
```

`event: init` was parsed in call 1 and then thrown away. In call 5 the parser saw the end of the
init data, then a blank line with `currentEvent === ""` (no emit), then `event: heartbeat`,
appended the heartbeat data to the still-pending init JSON, and emitted:

```text
heartbeat  data = [{"id": ...}] + "\n" + {"timestamp": ...}
```

`useNotifications` handles `heartbeat` by only refreshing connection state, so the entire
startup snapshot was silently discarded.

Small live `notification` events usually fit in one chunk and worked, which is why the bug looked
like a pagination problem.

## Fix

Parsing is now block-based:

- Split the concatenated buffer on `\n\n` and process every complete block.
- Return the **whole trailing incomplete block** (including its `event:` line) as the remainder.
- Join multi-line `data:` fields with `\n` as before.
- Normalize `\r\n` → `\n` on the concatenated buffer each call, so a chunk boundary that splits
  the `\r` and `\n` of one line ending is handled too.

## Trials, errors and lessons

### The page-size hypothesis

The user's "you capped the max notifications" explanation was reasonable. Before changing
`PAGE_SIZE`, check the server: `GET /api/notifications/count` = 29 and one page fetch = 29
items. That ruled out the cap and the store. Then run the real client code:

```bash
bun -e 'import { connectSSE } from "./src/utils/api"; ...'
```

and log the event names. Seeing `event: heartbeat` with a 23 KB array was the smoking gun.

### Tests had pinned the broken behavior

`utils.test.ts` asserted that an incomplete event returned only `"data: partial"` — the exact
loss of `event:`. The expectation now returns `"event: init\ndata: partial"`, plus new tests for
an event name that survives a chunk boundary and for a CRLF split across chunks.

### Don't count SSE items with `grep -c`

SSE payloads are one physical line, so `grep -c '"id":'` counts the line, not the items. Parse
the `data:` JSON (or count in Python) instead.

### Same bug affected large notifications

Any `notification` payload spanning a chunk could be renamed to the next event. Fixing the
parser globally prevents both the startup loss and intermittent mislabeled pushes.

## Verification

Live against `https://nuc.tail0ec64c.ts.net/events?limit=30`:

```text
streaming: true
init items: 29 first: 2026.11.10__11h57m59s.081-6f252a46 last: 2026.11.10__10h56m39s.789-a09ca59b
event: heartbeat {"timestamp": "2026-11-10T12:01:48.734933"}
```

The init payload is decrypted by the TUI's own `fetchNotifications`/`decryptItems`: 29 items,
0 locked with the local `e2e.key`. `make tui-test`: 139 pass, 0 fail.
