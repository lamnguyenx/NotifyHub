# TUI tests: machine host pill and host-model fallbacks

**Date**: 2026-11-11
**Status**: Done
**Parent**: [`2026-11-11-tui-waiting-card-machine-id.md`](2026-11-11-tui-waiting-card-machine-id.md)
**Sibling**: [`2026-11-11-tui-waiting-card-machine-id-component.md`](2026-11-11-tui-waiting-card-machine-id-component.md)

Modules: `src/notifyhub/tui/src/__tests__/` (`WaitingCards.test.tsx`, `Prototype.test.tsx`,
`README.md`); `tests/notifyhub/cli/test_cli.py`; `tests/notifyhub/backend/test_status.py`;
`tests/notifyhub/plugins/test_claude_hooks.py` and `test_codex_hooks.py`.

## What changed

### Waiting cards

- The existing full-card test now asserts `⌂ wsk` next to `◇ opencode`.
- New: `host: "Mac153"` renders `⌂ Mac153`.
- New: `host: null` still renders the card and `@ASSISTANT` line without a host pill.
- Existing layout test stays at 60×20 because the pill is inside the header row; card height and
  row indices do not change.

### CLI host_model

Three new cases in `tests/notifyhub/cli/test_cli.py`:

- `HOST_MODEL` wins over `HOSTNAME`.
- An exported `HOSTNAME` is used when `HOST_MODEL` is empty.
- With both empty, the payload falls back to `socket.gethostname()`.

### Backend status host

- Body `host` wins over the `X-NotifyHub-Host` header.
- The header wins over `request.client.host` (the TestClient default is `testclient`).
- A host-only change returns `changed=True` and re-announces the entry.
- The existing e2e envelope test still covers encrypted ingest/serving.

### Hook installers and plugin layouts

- Claude: both `UserPromptSubmit` and `PostToolUse` commands contain
  `x-notifyhub-host: $(hostname)`; the plugin-layout `hooks/hooks.json` is asserted separately.
- Codex: the Unix command contains `$(hostname)` and `commandWindows` contains `%COMPUTERNAME%`;
  the plugin layout is asserted too.

### Prototype harness

- `Prototype.test.tsx` renders the real `AppView` with fixtures and asserts the overview, scenario
  switching (`n` and number keys), locked rows, and the frozen/live clock.

## Trials, errors and lessons

### The host pill assertion needs the glyph

Asserting only `Mac153` passed before the icon existed. The test now asserts `⌂ Mac153`, so a future
change that silently drops the glyph fails.

**Lesson**: assert the visible marker, not just the data value; the marker is part of the design.

### The null-host test needs a value that is not elsewhere

`expect(frame).not.toContain("wsk")` is safe because the fixture pwd is `/home/user/project` and the
task does not contain `wsk`.

**Lesson**: a negative assertion is only meaningful when the string cannot appear in nearby
content. Pick a marker that is unique to the element under test.

### The CLI tests must override both env vars

`clean_env()` removes only `NOTIFYHUB_*`; the host shell may already have `HOSTNAME` or `HOST_MODEL`.
The fallback test explicitly sets both to `""` before asserting `socket.gethostname()`.

**Lesson**: sanitize the variables that participate in the decision, not only the project prefix.

### Header precedence needs a real request object

FastAPI's `TestClient` supplies `request.client.host == "testclient"`. Posting the same body with
and without the header distinguishes the three sources without mocking Starlette.

**Lesson**: use the framework's existing request fixture; a hand-built request would test the
mock, not the endpoint.

### Installer and plugin-layout JSON drift

The hook command lives in two places per agent: the Python installer template and
`hooks/hooks.json`. Both are now asserted, so a fix in one cannot silently miss the other.

**Lesson**: duplicate configuration needs duplicate assertions. Prefer a single source, but when
distribution formats require copies, test every copy.

### Spinner intervals still warn

The prototype and waiting-card tests log React `act(...)` warnings from the 120 ms spinner. They
are not failures.

**Lesson**: known caveat; do not remove the spinner to silence the warning.

## Verification

- `make tui-test`: **146 pass, 0 fail, 218 expect calls, 11 files**.
- `python -m pytest tests/notifyhub/cli -q`: **33 passed**.
- `python -m pytest tests/notifyhub/backend/test_status.py tests/notifyhub/plugins -q`:
  **68 passed**.
- `make test-backend`: 216 passed, 3 pre-existing `test_config.py` failures caused by this
  machine's real `~/.config/notifyhub/config.jsonl` and `NOTIFYHUB_CLI_*` env (they fail on `HEAD`
  with the changes stashed).
- `make tui-typecheck`: only documented pre-existing error classes.

## Docs updated

- `src/notifyhub/tui/src/__tests__/README.md` — suite list, count, prototype/host links.
- `src/notifyhub/tui/src/components/README.md` — host pill test expectation.
- `docs/important/tui-testing-guide.md` — prototype harness testing section.
- Root `README.md` / `src/notifyhub/tui/README.md` — current test counts.

## Related

- Parent: [`2026-11-11-tui-waiting-card-machine-id.md`](2026-11-11-tui-waiting-card-machine-id.md)
- Component: [`2026-11-11-tui-waiting-card-machine-id-component.md`](2026-11-11-tui-waiting-card-machine-id-component.md)
- Previous tests plan: [`2026-11-11-tui-waiting-cards-tests.md`](2026-11-11-tui-waiting-cards-tests.md)
