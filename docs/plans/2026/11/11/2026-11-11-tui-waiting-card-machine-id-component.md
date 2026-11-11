# TUI components: machine host pill on waiting cards

**Date**: 2026-11-11
**Status**: Done
**Parent**: [`2026-11-11-tui-waiting-card-machine-id.md`](2026-11-11-tui-waiting-card-machine-id.md)
**Sibling**: [`2026-11-11-tui-waiting-card-machine-id-tests.md`](2026-11-11-tui-waiting-card-machine-id-tests.md)

Module: `src/notifyhub/tui/src/components/` — `WaitingCards.tsx` and `README.md`.

## Goal

A waiting card already showed the project, the running prompt and the coding agent. It did not
show **which machine** the session ran on, even though `AgentStatusEntry.host` carried the value.
On a backend fed by several machines, two sessions in the same project looked identical.

## What changed

The header now renders two right-aligned pills:

```text
│  N  NotifyHub                             ◇ opencode  ⌂ Mac153 │
│                                                         2m ago │
```

- `HOST_GLYPH = "⌂"` (U+2302) prefixes the host value.
- The host pill uses `getHostModelTagColor(host, theme.background)` — the same FNV-1a palette and
  40% dimming as the completed card's `host_model` pill.
- `entry.host` is trimmed; empty/null omits the pill entirely.
- The host is truncated to 24 characters before rendering, so a pathological reporter value
  cannot squeeze the project title to nothing.
- The agent pill stays first and the host pill sits at the outer edge, matching where
  `host_model` sits on a completed card. A one-column margin separates the two backgrounds.
- No new row: the time keeps its existing row below the pills, so card height is unchanged.

## Design decisions

- **Machine identity belongs on the waiting card.** The agent pill says *who* is working; the host
  pill says *where*. Both are needed when sessions come from more than one machine.
- **`⌂`, not `@` or `🖥`.** `@` already labels the `@USER` / `@ASSISTANT` lines in the same card;
  `🖥` is double-width and reflows narrow headers. `⌂` is one cell in common monospace fonts and
  reads as host/home machine.
- **Reuse the completed card's tag treatment.** The helper's name is historical (`getHostModelTagColor`)
  but it hashes arbitrary short strings. A second palette would make the same machine look
  different before and after the turn.
- **Omit when absent.** An empty pill looks like a rendering bug and spends width for nothing.
- **Do not add a completion-card glyph.** `host_model` can be a model name (`gpt-4`), not a machine;
  a `⌂` there would be misleading. The waiting card's `host` is always the reporter's hostname or
  the backend-stamped IP.

## Trials, errors and lessons

### The status payload had the value all along

`AgentStatusEntry.host` was already populated by every reporter and printed in `GET /api/status`.
The old dock and the first waiting card simply never rendered it.

**Lesson**: inspect the existing payload before adding a field. This was a view change, not a
backend change.

### The test fixtures already had a host

Both `WaitingCards.test.tsx` and `layout.test.tsx` used `host: "wsk"` because the type required it.
The new assertions needed no fixture churn.

**Lesson**: realistic fixtures make follow-up changes cheap; an empty host would have hidden the
missing render.

### Two pills compete with the title at narrow widths

At 40 columns the header is avatar + title + agent pill + host pill. A 40-column preview shortened
the title (`a-rather-lo`) but kept both pills and the `@ASSISTANT` line intact.

**Lesson**: pills are fixed-width, the title is the flexible field. Verify the narrow case; if
hosts grow longer than the 24-character truncation, trim them further rather than removing the
title.

### The glyph choice is a width decision

The obvious "computer" glyph `🖥` is double-width. In a terminal that pushes the title and the
right border out by one cell and breaks the header rhythm at 40 columns.

**Lesson**: treat glyph width as part of the layout contract. Prefer one-cell symbols and test
them with `captureCharFrame()`, not just by reading the source.

## Verification

- `WaitingCards.test.tsx`: full card chrome includes `⌂ wsk`; a dedicated test asserts
  `⌂ Mac153`; a null host renders the card without a host pill.
- 40-column preview: both pills intact, long task wraps, `@ASSISTANT` not clipped.
- `make tui-test`: current suite passes (146 tests at the end of the session).
- `make tui-typecheck`: only the documented pre-existing error classes.

## Docs updated

- `src/notifyhub/tui/src/components/README.md` — waiting-card pill and glyph invariant.
- `docs/important/the-tui.md` §3 — diagram and header bullet.
- `docs/important/tui-rendering-rules.md` §6.1 — host pill placement and glyph.
- Root `README.md` §16 and `src/notifyhub/tui/README.md` — waiting-card summary.

## Related

- Parent: [`2026-11-11-tui-waiting-card-machine-id.md`](2026-11-11-tui-waiting-card-machine-id.md)
- Tests: [`2026-11-11-tui-waiting-card-machine-id-tests.md`](2026-11-11-tui-waiting-card-machine-id-tests.md)
- Previous waiting-card component plan:
  [`2026-11-11-tui-waiting-cards-component.md`](2026-11-11-tui-waiting-cards-component.md)
