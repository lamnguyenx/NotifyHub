# TUI components: waiting notification cards

**Date**: 2026-11-11
**Status**: Done (141 tests pass)
**Parent**: [`2026-11-11-tui-waiting-cards.md`](2026-11-11-tui-waiting-cards.md)
**Sibling**: [`2026-11-11-tui-waiting-cards-tests.md`](2026-11-11-tui-waiting-cards-tests.md)

Module: `src/notifyhub/tui/src/components/` — new `WaitingCards.tsx`; removed
`AgentStatusDock.tsx`; updated `README.md`.

## Goal

Render each in-flight agent session as a **notification card in waiting**, not a one-line dock
row. The card must show:

- the project header (avatar, title, pwd) and the coding agent doing the job;
- the running prompt on the `@USER` line;
- a live `@ASSISTANT loading <spinner>` line;
- the blocked and stalled states (`waiting for you ⚠`, `stalled? ◼`);
- the same content-measured height and rounded-card chrome as a real notification.

## Component shape

`WaitingCards.tsx` exports two components:

```tsx
<WaitingCards entries={agentStatus} now={now} />
  └── <WaitingCard entry={entry} now={now} />   // one per non-idle entry
```

Internal helpers:

- `AGENT_GLYPH` — `opencode: ◇`, `claude: ✳`, `codex: ◐`, fallback `●`.
- `useSpinner(active)` — 120 ms braille frames, only while running.
- `effectiveAgentState(entry, now)` — mirrors the backend's 5-minute stale window client-side.
- `statusLine(state, spinner, theme)` — the `@ASSISTANT` text, marker and colors.
- `cardBorderColor(state, theme)` — accent while running, warning while blocked/stalled.

The card reuses pure helpers from `NotificationRow.tsx`: `getTitle`, `getAvatarColor`,
`formatRelativeTime`, `getHostModelTagColor`, `truncate`.

## What changed

- **New card chrome** — rounded border, pwd-hashed avatar initial, bold project title, full pwd
  (truncated to 80 chars), relative session age, agent pill in the top-right. No fixed height;
  `flexShrink={0}` lets Yoga measure the wrapped `@USER` line.
- **Agent pill** — `◇ opencode`, `✳ claude`, `◐ codex`, with a dimmed background from
  `getHostModelTagColor(agent, theme.background)`, matching the host-model pill on real cards.
- **`@USER` line** — the task excerpt from `agent_status`, with a dim `(no task excerpt)` fallback
  when the reporter had no prompt.
- **`@ASSISTANT` line** — `loading <spinner>` while running, `waiting for you ⚠` when blocked,
  `stalled? ◼` when stale. The idle branch exists for direct renders but the container filters
  idle entries.
- **Container** — borderless column with `gap={1}` and `marginBottom={1}`; each card owns its
  border. Sorted by `updated` descending; returns `null` when there is nothing live.
- **Removed `AgentStatusDock.tsx`** — the old single-bordered container and its one-row layout are
  gone. No dead component or CSS is left behind.

## Design decisions

- **New component, not a `waiting` mode on `NotificationRow`.** A notification item and an agent
  status entry have different data shapes and lifecycles (one is persisted, one is ephemeral;
  one has a message, one has a task/state). Sharing the card markup would couple them. Sharing
  the pure helpers gives visual continuity without coupling.
- **Each card owns its border.** The dock's border was around the whole list. A card is the visual
  unit now; the container is layout only. This also lets the border color reflect each session's
  state.
- **State-colored border.** Accent while running, warning while blocked/stalled. Waiting cards are
  not selectable, so the accent border does not collide with the selected-card border in the feed.
- **Spinner per card.** `useSpinner` lives inside `WaitingCard` and only runs while the state is
  running. Hoisting it to the container would re-render every card on every frame.
- **Session age, not turn age.** `entry.since` is the entry's first observation. The card labels it
  as session age because the status API has no turn-start timestamp.
- **Time row always present.** The agent pill occupies the top-right, so the time goes on its own
  row beneath it, exactly like the host-model layout on real cards.
- **Graceful fallbacks.** Unknown agents get `●`; missing pwd gets the `getTitle`/avatar fallbacks;
  missing task gets the dim note. Status is best-effort and should never render a broken card.

## Trials, errors and lessons

### The dock's single-border container did not survive the redesign

The old component wrapped all rows in one `borderStyle="single"` box. Reusing that structure for
cards would have drawn a second border around already-bordered cards. The container became
borderless with a one-row gap, and each card renders its own rounded border.

**Lesson**: a "card list" is not a bordered list of rows. Decide whether the border belongs to the
container or the item; for notification-style cards it belongs to the item.

### The spinner hook belongs to the card, not the list

The old dock had one `useSpinner` per `AgentStatusRow`. Moving it into `WaitingCard` kept that
property. A shared frame counter in `WaitingCards` would re-render all cards every 120 ms.

**Lesson**: keep animation state as local as the animated element. A container-level interval is
only appropriate when every child animates in lockstep.

### `getHostModelTagColor` is generic despite its name

The helper hashes a string and mixes it with the background at 40% strength. It was written for
host-model pills but works for agent pills. We reused it rather than hardcoding brand colors.

**Lesson**: reuse the existing color helper so waiting cards and real cards share the same dimmed
pill treatment. If agent pills grow into a first-class concept, rename the helper to something
like `getTagColor`; the current name is historical.

### The `@USER` line can wrap, so the card cannot have a fixed height

A 160-char task excerpt wraps to several rows at narrow widths. The card uses
`flexShrink={0}` and no `height`; Yoga measures it. A 40-column preview confirmed four wrapped
lines and an intact `@ASSISTANT` line.

**Lesson**: do not copy the old dock's one-row assumption into the card. Test narrow widths and
let the text wrap; a hand-computed height will clip or add blank padding.

### Stale is a client-side derivation

The backend serves `stale` on `GET /api/status`, but an SSE `agent_status` entry can remain
`running` between events. `effectiveAgentState` applies the same 5-minute window locally so the
card flips to `stalled?` without waiting for a reconnect.

**Lesson**: when the server's stale transformation is only applied on read, mirror the window in
the live client; otherwise a crashed agent shows a spinner indefinitely.

### The idle branch is unreachable through the container, but kept

`WaitingCards` filters `state !== "idle"`, so `WaitingCard` never receives idle from the app. The
`statusLine` idle branch remains for direct component renders and to keep the switch total.

**Lesson**: keep the component's state switch total even when the current container filters a
state; tests and future callers may render it directly.

### The old component and test were deleted, not deprecated

Keeping `AgentStatusDock.tsx` around would leave two live representations of the same state and a
test that asserts the opposite of the new requirement. Both files were removed.

**Lesson**: when a new component subsumes an old one, delete the old component and its test. A
deprecated duplicate will drift and confuse the next reader.

## Verification

- `WaitingCards.test.tsx` (5 tests): full card chrome, blocked + client-side stale, one card per
  live session, missing-task fallback, idle hiding.
- `layout.test.tsx`: one waiting card + stream + footer at 60×20; card rows survive and the stream
  renders below.
- `make tui-test`: **141 pass, 0 fail**.
- Narrow-width manual preview at 40 columns: wrapped `@USER`, no clipping.

## Related

- Parent: [`2026-11-11-tui-waiting-cards.md`](2026-11-11-tui-waiting-cards.md)
- Tests: [`2026-11-11-tui-waiting-cards-tests.md`](2026-11-11-tui-waiting-cards-tests.md)
- Previous dock design: [`2026-11-10-tui-dock-display.md`](../10/2026-11-10-tui-dock-display.md)
- Operator guide: [`docs/important/the-tui.md`](../../../../../docs/important/the-tui.md)
