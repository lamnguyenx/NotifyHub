# TUI tests: popup assertions that do not encode the bug

**Date**: 2026-11-11
**Status**: Done (139 tests pass)
**Parent**: [`2026-11-11-tui-render-popup-lifecycle.md`](2026-11-11-tui-render-popup-lifecycle.md)

Module: `src/notifyhub/tui/src/__tests__/` — `App.test.tsx` changed; the other nine suites were
run unchanged as the regression baseline.

## What changed

```diff
 it("status and help are mutually exclusive", async () => {
   const { captureCharFrame, mockInput, renderOnce, renderer } = await render()
   await press("s", mockInput, renderOnce)
   await press("h", mockInput, renderOnce)
   const frame = captureCharFrame()
-  expect(frame).toContain("Help")
-  expect(frame).not.toContain("Status")
+  // Match popup titles: the help body itself lists "s  Status popup".
+  expect(frame).toContain("NotifyHub — Help")
+  expect(frame).not.toContain("NotifyHub — Status")
   renderer.destroy()
 })
```

No new test file was added. The popup-sizing and select-scroll fixes were verified in the test
renderer (existing suites) and in a real tmux terminal.

## Why the old assertion was wrong

The old test checked for the bare word `"Status"` and passed only because the help popup was
15 rows tall for 14 rows of content, so Yoga overlapped rows and hid the
`s  Status popup` help line. When the popup was sized correctly, the line appeared and the test
failed — the test was asserting the bug.

The fix asserts on the full popup titles, which are unique and cannot appear in the other popup's
body:

- `NotifyHub — Help`
- `NotifyHub — Status`

## Trials, errors and lessons

### A passing test can be evidence of the bug

`expect(frame).not.toContain("Status")` was green for the wrong reason. The help body legitimately
contains the word "Status", so the assertion only held while a row was hidden.

**Lesson**: assert on a string that identifies the thing under test (a title, a full line, a row
index), not on a word that can appear in surrounding content. If a test starts failing after a
rendering fix, check whether it was encoding the broken layout.

### Fixed heights are also test-visible

The popup tests (`HelpPopup.test.tsx`, `StatusPopup.test.tsx`) assert `toContain("Press any key to
close")` and the heading, but not that *all* rows are present. That is why the overlap survived a
green suite: the missing rows were never asserted.

**Lesson**: a popup whose height is a constant needs a test that checks the first and last content
rows, or every row. For example, assert `Toggle select mode` **and** `Press any key to close`, and
in Status assert `Notifications:` **and** `Locked rows:`.

### The Unicode advice in the old guide was a workaround, not a rule

The testing guide said "avoid asserting on text with Unicode em dashes or arrows". That advice
existed because the source used `\u2014` as literal JSX text and the frame contained the escape
sequence. Once the popup title is a JavaScript string expression, the frame contains the actual
`—` glyph and the assertion is safe.

**Lesson**: fix the source (put escapes in `{"…"}`), then assert the real glyph. Keep the
"avoid dense Unicode" caveat only for genuinely ambiguous width/measurement cases.

### Two `renderOnce` calls per key press still apply

The popup test uses the shared `press()` helper: one `renderOnce` processes the key event and the
second renders the React state update. A single render can show the old popup and make a toggle
test flaky.

**Lesson**: keep the two-pass helper for every key-driven assertion, including popup toggles.

### `process.exit(0)` is not testable in-process

The quit fix lives in the entrypoint and `App.tsx`. Calling it from a unit test would kill the
runner, so it was verified by launching the real TUI in tmux and checking the exit code.

**Lesson**: lifecycle/exit behavior belongs in a manual or subprocess check; do not try to assert
it with an in-process renderer.

## Verification

```
make tui-test
139 pass
0 fail
186 expect() calls
Ran 139 tests across 10 files.
```

The live check in tmux covered the parts the suite cannot: popup row completeness at a real
terminal size, resize behavior, select-mode scrolling, and exit status.

## Follow-ups

- Add a row-completeness test for each popup (`Toggle select mode` … `Press any key to close`;
  `Notifications:` … `Locked rows:`).
- Add a truncation-marker frame test (`[+24 lines, +517 chars] you restart…`) so spacing
  regressions are caught.
- Consider a subprocess test for `q` (spawn `bun src/index.tsx` under a pty, send `q`, assert exit
  code 0) if lifecycle regressions become common.
