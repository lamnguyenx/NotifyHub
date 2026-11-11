# TUI: show the machine ID on waiting cards

**Date**: 2026-11-11
**Status**: Done (146 TUI tests at session end, 33 CLI tests pass)
**Parent**: [`2026-11-11-tui-waiting-cards.md`](2026-11-11-tui-waiting-cards.md)
**Follows**: commit `e4180b8` — Replace AgentStatusDock with WaitingCards

Modules: `src/notifyhub/tui/` — `components/WaitingCards.tsx`,
`__tests__/WaitingCards.test.tsx`, component/test READMEs, TUI rendering rules and operator docs;
`src/notifyhub/cli/cli.py` + `tests/notifyhub/cli/test_cli.py` for the `host_model` fallback;
`src/notifyhub/backend/backend.py` and the claude/codex hook installers for the raw-hook host
header.

## Module map

| Module | Plan |
|---|---|
| `src/notifyhub/tui/src/components/` (host pill) | [`2026-11-11-tui-waiting-card-machine-id-component.md`](2026-11-11-tui-waiting-card-machine-id-component.md) |
| `src/notifyhub/tui/src/__tests__/` (waiting-card assertions) | [`2026-11-11-tui-waiting-card-machine-id-tests.md`](2026-11-11-tui-waiting-card-machine-id-tests.md) |
| `src/notifyhub/backend/` (header precedence, broadcast) | [`2026-11-11-agent-status-host-header-backend.md`](2026-11-11-agent-status-host-header-backend.md) |
| `src/notifyhub/cli/` (`host_model` fallback) | [`2026-11-11-agent-status-host-header-cli.md`](2026-11-11-agent-status-host-header-cli.md) |
| `src/notifyhub/plugins/` (claude/codex one-liners) | [`2026-11-11-agent-status-host-header-plugins.md`](2026-11-11-agent-status-host-header-plugins.md) |

## Goal

The waiting cards shipped in `e4180b8` rendered the project, the agent pill, the task excerpt and
the live assistant line, but not **which machine the session runs on**. Completed notification
cards show a `host_model` pill (usually the reporter's hostname) in the top-right corner; waiting
cards spent that corner on the agent pill only. On a backend that receives sessions from several
machines, two waiting cards for the same project were indistinguishable.

The request was direct: *"where's my machine ID"*. The status payload already carried `host`; the
view simply never rendered it.

## What changed

### `WaitingCards.tsx`

The header now renders two pills, right-aligned:

```text
│  N  NotifyHub                             ◇ opencode  ⌂ Mac153 │
│                                                         2m ago │
```

- `host` is trimmed from the status entry; empty/null omits the pill entirely.
- The host pill reuses `getHostModelTagColor(host, theme.background)` — the same FNV-1a palette and
  40% dimming as `host_model` on completed cards — and is truncated to 24 characters.
- It carries the one-cell `⌂` host marker (`⌂ Mac153`), matching the agent pill's visual rhythm.
  The `🖥` emoji is deliberately avoided because it is double-width.
- The agent pill stays first, the host pill occupies the right edge on its own (completed cards put
  `host_model` alone in that corner). A one-column margin separates the two backgrounds.
- `entry.host` is whatever the reporter sent (`socket.gethostname()` / `os.hostname()`), or the
  client IP the backend stamps when the reporter sent none. The UI labels nothing — it shows the
  value verbatim, so hostnames, short machine IDs and IPs all work.

### `cli.py`

The waiting card reads `host` from the status reporter (`socket.gethostname()`), but completed
cards read `host_model` from the push CLI, which only looked at `$HOST_MODEL` and `$HOSTNAME`.
`HOSTNAME` is a bash shell variable and is often **not exported**, so the completion card could
lose the machine pill right after the waiting card showed it.

`cli.py` now falls back to `socket.gethostname()`:

```python
host_model = os.environ.get("HOST_MODEL", "").strip()
if host_model in ("", "Unknown"):
    host_model = os.environ.get("HOSTNAME", "").strip() or socket.gethostname().strip()
```

This keeps `HOST_MODEL` as the explicit override, preserves `HOSTNAME` when it is exported, and
makes every push carry a machine tag otherwise. Claude, Codex and OpenCode all push through this
CLI, so the fix covers all three integrations without touching the reporters.

### Host header for the raw status hooks

The live status dump still showed one claude session with `host: "172.21.0.1"` — a Docker bridge
address, not a machine name. The claude and codex `UserPromptSubmit`/`PostToolUse` status hooks
pipe the upstream hook payload straight through `curl --data-binary @-`; that payload has
`session_id`/`cwd`/prompt but no `host`, so the backend fell back to `request.client.host`.
Behind Docker that is the bridge gateway, and the `running` refreshes kept re-stamping it.

Rewriting the payload with `jq`/`sed` would add a dependency or fragile JSON surgery to the hot
path, and switching to the Python hook would pay interpreter startup per tool call. Instead:

- The one-liners send `X-NotifyHub-Host: $(hostname)` (Windows: `%COMPUTERNAME%`).
- `POST /api/status/<agent>/<state>` prefers `body.host` (opencode plugin / Python hooks), then
  `X-NotifyHub-Host`, then the client IP.
- A host-only change now counts as a visible change, so the corrected name is broadcast over SSE
  immediately instead of waiting for the next state transition.
- Both the installer templates and the plugin-layout `hooks.json` files were updated, so settings
  merges and `claude --plugin-dir` / Codex plugin installs agree.

Users must re-run `make install-plugin-claude` / `make install-plugin-codex` (and restart the
agent session) to pick up the header. Existing entries keep the old host until their next status
event.

### Tests

- The full-card test now asserts the fixture host (`wsk`) is visible next to `◇ opencode`.
- New test: a `host: "Mac153"` entry renders the host pill.
- New test: `host: null` still renders the card and assistant line, without the host pill.
- CLI: `HOST_MODEL` wins; exported `HOSTNAME` is second; `socket.gethostname()` is the fallback.
- Backend: body host wins over the header; the header wins over the client address; a host-only
  change re-announces over SSE.
- Installers/plugin layouts: the claude and codex one-liners contain the host header (Windows
  included).

### Docs

- Root `README.md` §16, `docs/important/the-tui.md` §3, `docs/important/agent-status.md`,
  `docs/important/tui-rendering-rules.md` §6.1, and both TUI READMEs.
- Test counts moved from 141 to 143.

## Design decisions

- **Host pill, not a new header row.** The corner already has pill affordances on completed cards;
  adding a row would make every waiting card taller and push the feed down. The time already has
  its own row, so the header height is unchanged.
- **Right of the agent pill, at the outer edge.** Completed cards put the machine tag in the
  top-right corner. Keeping that position makes a waiting card and its eventual completion card
  read as the same object.
- **Reuse `getHostModelTagColor`.** The helper is generic despite its name (documented in the
  component plan); a second color hash would make the same machine look different on waiting and
  completed cards.
- **`⌂`, not the computer emoji.** The agent pill already establishes a glyph-then-label pattern,
  so the host pill gets the same rhythm. `⌂` (U+2302) is one cell in common monospace fonts and
  reads as "host/home machine"; `🖥` (U+1F5A5) is double-width and would reflow the header in
  narrow terminals. `@Mac153` is the older docs convention, but `@` already labels `@USER` and
  `@ASSISTANT` lines in the same card.
- **Omit when absent.** An empty pill would look like a rendering bug and spend width for nothing.
  The status `host` is optional (backend falls back to the client IP, but an entry can still be
  constructed without it).
- **Truncate at 24 characters.** Hosts are normally short (`Mac153`, `wsk`, `nuc`), but the field
  accepts arbitrary reporter input. The title has `flexShrink={1}`; a pathological host should not
  push the title to zero columns.
- **No backend/plugin change.** `AgentStatusEntry.host` already existed and every reporter
  (`opencode`, `claude`, `codex`) sends `hostname()`. The machine ID was in the payload all along.
- **One machine identity across both card kinds.** Waiting cards get `host` from the status
  reporter; completed cards get `host_model` from the push CLI. Making the CLI fall back to
  `socket.gethostname()` keeps the same machine tag visible before and after the turn ends,
  instead of the waiting card's pill vanishing when the completion card lands.

## Trials, errors and lessons

### The old design decision was explicit, not accidental

The waiting-card plan said: *"No host row … the status entry only carries a host/IP, so the
waiting card spends that header space on the coding-agent pill instead."* That was a reasonable
call while only one machine reported. Once the TUI is used from several machines, the missing tag
is the first thing the user notices.

**Lesson**: a documented "out of scope" can become the next request. Keep the payload field even
when the first view does not render it; the data was there, so the follow-up was a view change.

### Narrow widths make two pills compete with the title

At 40 columns the header is avatar + title + agent pill + host pill. A 40-column preview with a
long project name clipped the title to `a-rather-lo`, but both pills stayed intact and the
`@ASSISTANT` line was not squeezed.

**Lesson**: pills are fixed-width and the title is the flexible field. Verify the narrow case; if
hosts grow longer than the 24-character truncation, trim them further or move the host to the time
row rather than letting the title disappear.

### The fixture already had a host

`WaitingCards.test.tsx` and `layout.test.tsx` both used `host: "wsk"` from the start, because the
status entry type required it. The tests could assert the new pill with no fixture churn.

**Lesson**: realistic fixtures make follow-up changes cheaper. A host of `""` would have hidden
the missing render until a real machine appeared.

### `$HOSTNAME` is a shell variable, not an environment guarantee

`cli.py` trusted `os.environ["HOSTNAME"]`. In bash, `HOSTNAME` is set as a shell variable but is
not exported by default (`env | grep HOSTNAME` is empty), so a push launched from that shell can
carry no `host_model` at all. The status reporters were unaffected because they call
`socket.gethostname()` directly.

**Lesson**: prefer the OS API over a shell convenience variable for identity fields. Environment
variables are an override mechanism, not a reliable source of machine facts.

### Test counts are still duplicated

The suite grew from 141 to 143 in two places (`src/notifyhub/tui/README.md`,
`src/notifyhub/tui/src/__tests__/README.md`) plus the rendering-rules floor. The historical plan
docs keep their original counts because they describe the suite at that time.

**Lesson**: update current-state docs, not history. Grep for the old number and decide per hit
whether it is a snapshot or a live invariant.

## Verification

- `make tui-test`: **146 pass, 0 fail, 218 expect calls, 11 files** at session end (143 when this
  module's tests were added; the prototype harness tests followed).
- `python -m pytest tests/notifyhub/cli -q`: **33 passed** (three new host_model cases).
- `python -m pytest tests/notifyhub/backend/test_status.py tests/notifyhub/plugins -q`:
  **68 passed** (header precedence, host-change broadcast, installer/layout assertions).
- `make test-backend`: **216 passed, 3 failed** — the same **3 pre-existing** `test_config.py`
  failures remain, caused by an environment leak from this machine's
  `~/.config/notifyhub/config.jsonl` and `NOTIFYHUB_CLI_*` env; they fail on `HEAD` with the
  changes stashed. Everything else passes.
- 40-column preview (temporary, not committed): header `◇ opencode  ⌂ Mac153` intact, title
  shortened, `@ASSISTANT loading` intact.
- `layout.test.tsx` still passes unchanged: the pills live inside the existing header row, so the
  seven-row card shape and the 60×20 composition are unchanged.
- `git diff --check`: clean.

## Docs updated

- `README.md` §16 — waiting-card summary now mentions the host pill.
- `docs/important/the-tui.md` §2–3 — `host_model` resolution note, diagram and header bullet.
- `docs/important/agent-status.md` — host-field precedence and the raw-hook header.
- `docs/important/claude-code-hooks.md`, `codex-hooks.md` — header note and reinstall step.
- `docs/important/tui-rendering-rules.md` §6.1 and the test-count floor.
- `src/notifyhub/tui/README.md`, `src/components/README.md`, `src/__tests__/README.md`.
- New/updated module READMEs: `src/notifyhub/backend/README.md`,
  `src/notifyhub/cli/README.md`, `src/notifyhub/plugins/README.md`,
  `src/notifyhub/plugins/claude/README.md`, `src/notifyhub/plugins/codex/README.md`.
- Module plans: [component](2026-11-11-tui-waiting-card-machine-id-component.md),
  [tests](2026-11-11-tui-waiting-card-machine-id-tests.md),
  [backend](2026-11-11-agent-status-host-header-backend.md),
  [CLI](2026-11-11-agent-status-host-header-cli.md),
  [plugins](2026-11-11-agent-status-host-header-plugins.md).

## Related

- Parent: [`2026-11-11-tui-waiting-cards.md`](2026-11-11-tui-waiting-cards.md)
- Component: [`2026-11-11-tui-waiting-card-machine-id-component.md`](2026-11-11-tui-waiting-card-machine-id-component.md)
- Tests: [`2026-11-11-tui-waiting-card-machine-id-tests.md`](2026-11-11-tui-waiting-card-machine-id-tests.md)
- Backend: [`2026-11-11-agent-status-host-header-backend.md`](2026-11-11-agent-status-host-header-backend.md)
- CLI: [`2026-11-11-agent-status-host-header-cli.md`](2026-11-11-agent-status-host-header-cli.md)
- Plugins: [`2026-11-11-agent-status-host-header-plugins.md`](2026-11-11-agent-status-host-header-plugins.md)
- Status payload: `docs/important/agent-status.md`
