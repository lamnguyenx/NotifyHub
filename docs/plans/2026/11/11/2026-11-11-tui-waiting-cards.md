# TUI: waiting notification cards for in-flight agent sessions

**Date**: 2026-11-11
**Status**: Done (141 tests pass)
**Parent**: [`2026-11-11-tui-components-cards-popups.md`](2026-11-11-tui-components-cards-popups.md)

Module: `src/notifyhub/tui/` — `App.tsx`, `utils/api.ts` comment, module README, removed
`components/AgentStatusDock.tsx`.

## Module map

| Module | Plan |
|---|---|
| `src/notifyhub/tui/` (parent) | this doc — App wiring, dock removal, docs, overall behavior |
| `src/notifyhub/tui/src/components/` | [`2026-11-11-tui-waiting-cards-component.md`](2026-11-11-tui-waiting-cards-component.md) |
| `src/notifyhub/tui/src/__tests__/` | [`2026-11-11-tui-waiting-cards-tests.md`](2026-11-11-tui-waiting-cards-tests.md) |

## Goal

The live dock above the stream showed one status-only row per session
(`⠙ ◇ opencode · NotifyHub · 2m ago`). The task excerpt was deliberately hidden, so the dock
told you *that* an agent was running but not *what* it was doing. A completion notification,
by contrast, renders the turn as a real card with `@USER` and `@ASSISTANT` lines.

The user asked to turn the dock into a **notification card in waiting**: the special card shows
the running prompt as `@USER`, the assistant as `@ASSISTANT loading`, and the coding agent doing
the job. A running session is the same card before its `@ASSISTANT` reply exists, so the feed
reads continuously: the in-flight card disappears when the real completion card arrives.

## What changed

### `App.tsx`

`<AgentStatusDock entries={agentStatus} now={dockNow} />` became
`<WaitingCards entries={agentStatus} now={waitingNow} />`. The cards stay pinned above the
scrollbox, so the live area keeps its full height and the stream still gets the remaining space
(`flexGrow={1}` + `minHeight={0}`).

### Removed

`components/AgentStatusDock.tsx` and `__tests__/AgentStatusDock.test.tsx` were deleted; the
waiting cards replace the dock. `utils/api.ts`'s comment now says "waiting cards" instead of
"dock".

### Behavior

- One card per non-idle `agent_status` entry, sorted by `updated` descending.
- Header mirrors a real notification card: pwd-hashed avatar initial, bold project title, full
  pwd, session age, and a coding-agent pill (`◇ opencode`, `✳ claude`, `◐ codex`).
- `@USER` renders the backend's ≤160-char, whitespace-collapsed task excerpt.
- `@ASSISTANT` renders `loading <spinner>` while running, `waiting for you ⚠` when blocked, and
  `stalled? ◼` when a `running` entry has not refreshed for 5 minutes.
- Running cards use the accent border; blocked/stalled cards use the warning border.
- Idle entries are hidden. A card disappears when its completion notification lands (matched by
  `data.session_id`) or when an `idle` status arrives.
- No backend or plugin changes: `agent_status` already carried `agent`, `session_id`, `state`,
  `pwd`, `task`, `since`, and `updated`.

## Design decisions

- **Replace the dock, do not keep both.** The waiting card subsumes the dock's information and
  adds the prompt, so a parallel dock would duplicate state and waste rows.
- **Pinned above the stream, not inside the scrollbox.** Inside the feed the waiting cards would
  scroll out of view and would need to participate in select-mode indexing and delete handling.
  Pinning preserves the old dock invariant: live cards are never squeezed by a long notification
  list.
- **The completion notification still comes from the backend.** No synthetic notification is
  inserted into `notifications`; the waiting card is display state only and resolves through
  `data.session_id` when the real card lands.
- **Task excerpt instead of a new API field.** The status payload already carries the excerpt;
  the card simply renders it.
- **No host row.** The notification card's host-model pill is a model tag, not a machine name;
  the status entry only carries a host/IP, so the waiting card spends that header space on the
  coding-agent pill instead.
- **Session age, not turn age.** `since` is the entry's first observation (see
  `backend/models.py`). The status API has no `turn_since`, so the card labels the time as
  session age. A true per-turn timestamp would need a backend field and is out of scope.

## Trials, errors and lessons

### The old dock test encoded the opposite requirement

`AgentStatusDock.test.tsx` asserted `expect(frame).not.toContain("fix the flaky test")` because
the dock was status-only. The new card intentionally renders that text. The test had to be
replaced, not just extended.

**Lesson**: when a requirement reverses, rewrite the test and the docs together. A stale negative
assertion either fails or, worse, keeps protecting behavior the user no longer wants.

### Pinned vs. in-stream was the main design fork

Putting the cards inside the scrollbox would make them scroll away and force select-mode/delete
semantics onto display-only state. We kept them above the scrollbox, like the dock.

**Lesson**: ephemeral, non-interactive state belongs outside the interactive list. If it must
scroll with the feed, it needs an explicit selection model and a delete story first.

### "Elapsed since the turn began" was wrong

The first draft of the operator docs labeled the timestamp as turn age. `since` is actually the
entry's first observation and survives idle → running transitions, so it is session age.

**Lesson**: read the backend model comment before labeling a timestamp. If the UI needs turn age,
add a real `turn_since` field rather than inferring it from `since` or `updated`.

### The docs had many copies of the dock behavior

"dock" appeared in the root `README.md`, `docs/important/the-tui.md`,
`docs/important/agent-status.md`, the plugin/hook guides, the testing guide, and the component and
test READMEs. `grep -rn "dock"` found them all.

**Lesson**: when replacing a named component, grep the old name across docs, tests and comments;
otherwise the operator guide keeps advertising removed behavior.

### Typecheck noise is a baseline, not a regression

`make tui-typecheck` reports the documented pre-existing classes (missing `bun:test`/Node
declarations, `CliRenderer.on/off` in `theme.tsx`). The new test adds one more instance of the
missing `bun:test` error, not a new category.

**Lesson**: compare typecheck against `HEAD` and document the baseline. Do not claim a clean
typecheck when the repository has known noise.

### Spinner intervals produce React act warnings in tests

The braille spinner updates state every 120 ms. The test renderer logs
`An update to Root inside a test was not wrapped in act(...)`, the same pattern the dock tests
had. The assertions still pass.

**Lesson**: known caveat, not a failure. If the warnings become noisy, use fake timers or wrap
the interval-driven render in `act()`; do not mistake the warning for a broken test.

### No backend change was needed

The status payload already had everything: `agent`, `session_id`, `state`, `pwd`, `task`, `since`,
`updated`. We only changed the view.

**Lesson**: inspect the existing API payload before adding a field. The task excerpt was already
there; the old dock simply chose not to render it.

## Verification

- `make tui-test`: **141 pass, 0 fail, 201 expect calls, 10 files**.
- `make tui-typecheck`: only the documented pre-existing error classes.
- `git diff --check`: clean.
- Narrow-width preview at 40 columns: a long task wraps across four lines and the
  `@ASSISTANT loading` line is not clipped.
- `WaitingCards.test.tsx` covers the card; `layout.test.tsx` covers the App composition.

## Docs updated

- Root `README.md` §16 — waiting cards section and `agent_status` link.
- `docs/important/the-tui.md` — section 3 rewritten, project structure, SSE/REST references,
  session-age caveat, plan links.
- `docs/important/agent-status.md` — task excerpt now rendered on the waiting card, plan link.
- `docs/important/tui-testing-guide.md` — waiting-card layout example, tests plan link.
- `docs/important/tui-rendering-rules.md` — waiting-card layout rule, test count, plan link.
- `docs/important/claude-code-hooks.md`, `codex-hooks.md`, `opencode-plugin.md` — "TUI waiting
  card" wording.
- `src/notifyhub/tui/README.md`, `src/components/README.md`, `src/__tests__/README.md` — feature,
  layout, history and plan links.
