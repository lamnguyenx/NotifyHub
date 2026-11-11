# TUI tests: waiting notification cards

**Date**: 2026-11-11
**Status**: Done (141 tests pass)
**Parent**: [`2026-11-11-tui-waiting-cards.md`](2026-11-11-tui-waiting-cards.md)
**Sibling**: [`2026-11-11-tui-waiting-cards-component.md`](2026-11-11-tui-waiting-cards-component.md)

Module: `src/notifyhub/tui/src/__tests__/` — new `WaitingCards.test.tsx`; updated
`layout.test.tsx`; removed `AgentStatusDock.test.tsx`; updated `README.md`.

## What changed

### `WaitingCards.test.tsx` (new, 5 tests)

1. **Full card chrome** — project title, full pwd, `◇ opencode` agent pill, `@USER` task,
   `@ASSISTANT loading`, relative session age, rounded border characters.
2. **Blocked and stalled lines** — a `blocked` claude card renders `waiting for you`; a card still
   reported as `running` but with an `updated` 10 minutes old renders `stalled?` through the
   client-side stale mirror.
3. **One card per live session** — opencode and codex entries render separate cards with their
   own project titles.
4. **Missing task fallback** — `task: null` renders `@USER` plus the dim `(no task excerpt)` note.
5. **Idle hiding** — an idle-only list renders nothing (`opencode` is absent from the frame).

### `layout.test.tsx` (rewritten)

The old test composed three one-row dock entries + stream + footer at 60×16. A waiting card is
seven rows (border, header, time, pwd, `@USER`, `@ASSISTANT`, border) plus a one-row gap, so the
composition was rebuilt around one card at 60×20:

```tsx
<WaitingCards entries={entries} now={now} />
<NotificationStream notifications={items} onDelete={() => {}} />
...
<box width="100%" height={1}><text>FOOTER</text></box>
```

Assertions:

- row 1 — project title (`proj1`);
- row 3 — full pwd;
- row 4 — `@USER` and `task-1`;
- row 5 — `@ASSISTANT` and `loading`;
- rows 0–7 — no `notification-` text (the stream must not overwrite the card);
- rows 8+ — `notification-0`;
- row 19 — `FOOTER`.

### Removed

`AgentStatusDock.test.tsx` (3 tests) was deleted with the dock component. The suite stays at
**10 files**; the test count moves from **139 to 141** (139 − 3 + 5).

## Trials, errors and lessons

### The old dock test encoded the opposite requirement

`AgentStatusDock.test.tsx` asserted `expect(frame).not.toContain("fix the flaky test")` — the dock
was status-only. The new card intentionally renders that text. The old file could not be updated
in place; it was replaced by `WaitingCards.test.tsx`.

**Lesson**: when a requirement reverses, rewrite the test and the docs together. A stale negative
assertion either fails or keeps protecting behavior the user no longer wants. In this case the
negative assertion was the entire point of the old feature, so the whole file had to go.

### Test the stale derivation, not the precomputed state

The first version of the blocked/stalled test passed `state: "stale"` directly. That only
exercised the rendering branch; it did not test `effectiveAgentState`, the client-side mirror that
flips a silent `running` entry after five minutes. The final test passes `state: "running"` with an
`updated` 10 minutes in the past.

**Lesson**: when the component derives a value, feed it the inputs and assert the derived output.
Passing the derived state directly tests the switch, not the logic.

### The layout test dimensions were tied to the old row shape

The old layout test asserted three dock rows at 60×16. Three seven-row waiting cards need at
least 3 × 7 + 2 gaps = 23 rows, so the old composition cannot be reused. The new test uses one
card and 60×20, and asserts specific rows rather than just `toContain`.

**Lesson**: layout tests encode component height. When a component changes shape, recompute the
test dimensions and row indices; a `toContain` assertion can pass while rows are overlapped or
clipped.

### `testRender` + `captureCharFrame` need unique strings

The card uses the same words as the rest of the UI (`opencode`, `loading`, `project`). The tests
assert on identifiers that cannot appear in nearby content: `◇ opencode`, `@USER`, `@ASSISTANT`,
`waiting for you`, `stalled?`, `no task excerpt`.

**Lesson**: assert on the full marker/tag line, not a bare word that another card or the footer
could contain.

### Spinner intervals produce React act warnings

`useSpinner` updates state every 120 ms. The in-memory renderer logs
`An update to Root inside a test was not wrapped in act(...)`. The dock tests had the same
pattern; the suite still passes and the warnings are not assertion failures.

**Lesson**: known caveat. If the warnings become noisy, use fake timers or wrap the timer-driven
render in `act()`. Do not treat the warning as a broken test, and do not silence it by removing
the spinner.

### The new test adds the same typecheck noise, not a new category

`make tui-typecheck` reports `Cannot find module 'bun:test'` for every test file. The new
`WaitingCards.test.tsx` adds one more instance of that existing class. `App.tsx`'s `process`
errors and `theme.tsx`'s `CliRenderer.on/off` errors are also pre-existing.

**Lesson**: compare typecheck against `HEAD` before calling an error a regression. The test suite
is the reliable gate; the typecheck baseline is documented noise.

### The test count is documented in several places

The old count (139) appeared in `src/notifyhub/tui/README.md`, `src/__tests__/README.md`, and
`docs/important/tui-rendering-rules.md`. All three were updated to 141.

**Lesson**: when the suite size changes, grep for the old number. A stale count is a small but
visible sign that the docs were not swept.

### Remove no-op hooks when rewriting a test file

The old dock test had `afterEach(() => {})`, copied from an earlier template. It does nothing.
The new `WaitingCards.test.tsx` drops it.

**Lesson**: rewrite, don't copy. A no-op hook is harmless but signals that the file was cloned
without review.

## Verification

- `cd src/notifyhub/tui && bun test` → **141 pass, 0 fail, 201 expect calls, 10 files**.
- `make tui-typecheck` → only the documented pre-existing error classes.
- `WaitingCards.test.tsx` runs in the in-memory renderer; no backend or TTY is involved.
- The 40-column preview (temporary, not committed) confirmed a long task wraps and the
  `@ASSISTANT` line is not clipped.

## Related

- Parent: [`2026-11-11-tui-waiting-cards.md`](2026-11-11-tui-waiting-cards.md)
- Component: [`2026-11-11-tui-waiting-cards-component.md`](2026-11-11-tui-waiting-cards-component.md)
- Previous test-assertion work: [`2026-11-11-tui-tests-popup-assertions.md`](2026-11-11-tui-tests-popup-assertions.md)
- Testing guide: [`docs/important/tui-testing-guide.md`](../../../../../docs/important/tui-testing-guide.md)
