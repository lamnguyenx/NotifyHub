# Agent Status Live Broadcast (herdr-style)

**Date**: 2026-11-10
**Status**: Done (deployed to the nuc backend + reporters live on wsk; verified end-to-end)

## Goal

Answer *"is a task running right now?"* — let the NotifyHub backend know, live, whether each
`opencode` / `claude` / `codex` session on this machine is **running / blocked / idle**, show it in
the TUI as a live dock (spinner while a chat is on), and correlate each running turn with the
notification card that lands when it finishes — carrying a short excerpt of the running task.

Research origin: `_refs/herdr` (a terminal agent runtime). The task was to study how herdr
"connects" to the three CLIs and port the useful layer to NotifyHub.

Module docs (this session touched each separately):

| Module | Plan doc |
|---|---|
| backend (+ config) | [`2026-11-10-agent-status-backend.md`](2026-11-10-agent-status-backend.md) |
| cli (push script) | [`2026-11-10-agent-status-cli-session-id.md`](2026-11-10-agent-status-cli-session-id.md) |
| plugins/opencode | [`2026-11-10-agent-status-plugin-opencode.md`](2026-11-10-agent-status-plugin-opencode.md) |
| plugins/claude | [`2026-11-10-agent-status-plugin-claude.md`](2026-11-10-agent-status-plugin-claude.md) |
| plugins/codex | [`2026-11-10-agent-status-plugin-codex.md`](2026-11-10-agent-status-plugin-codex.md) |
| tui | [`2026-11-10-agent-status-tui.md`](2026-11-10-agent-status-tui.md) |

Operator-facing guide: `docs/important/agent-status.md`.

## What herdr does (research summary)

herdr identifies and tracks agents with three decoupled layers (`_refs/herdr/src/`):

1. **Process identity** — `src/detect/mod.rs` maps the pane's foreground process cmdline
   (`claude`, `node …/codex`, `opencode`, wrapper scripts, versioned binaries) to an `Agent`.
2. **Hook/channel reporting** — `src/integration/`: per-agent installed hooks/plugins report
   lifecycle over a Unix socket (`pane.report_agent`) with `{state, agent_session_id, seq}`.
   OpenCode gets a **resident TS plugin** with full lifecycle authority; claude/codex only get
   session-identity hooks (SessionStart) because their hook systems lack granular events.
3. **Screen detection** — `src/detect/manifests/*.toml`: evidence-based bottom-of-buffer rules
   (spinner in OSC title → working, "esc to cancel + enter to confirm" → blocked, …).

NotifyHub owns no PTYs, so layer 3 doesn't port. We ported layer 2's model — thin reporters,
server-owned runtime facts — over HTTP instead of a Unix socket, and chose hooks per agent from
what each CLI actually exposes (verified by running each CLI and by grepping the shipped binary
for event/hook names).

## Decisions (locked with the user)

| Question | Decision | Why |
|---|---|---|
| Rust reporter binary? | **No — `sh -c 'curl --data-binary @-'` one-liners** | Hooks are `async`, so the 2-5ms vs 1-2ms spawn difference is invisible; curl matched the existing funnel drop-script precedent; no cargo toolchain/distribution on every pushing machine. |
| Where does parsing live? | **Server-side** | The backend extracts `session_id`/`cwd`/`prompt` from raw hook payloads, so reporters stay one-line commands with zero JSON parsing. Same "thin client, server owns runtime facts" boundary herdr uses. |
| Transport auth | **Plaintext over TLS** (no e2e envelope on ingest) | Matches the user's existing no-auth funnel decision; status is RAM-only; serving side is still e2e-encrypted per entry. |
| Stale window | **5 min** (config `backend.agent_status_stale_seconds`) | Crashed agents should stop showing "running" quickly; claude `PostToolUse` / codex `PostModelRequest` / opencode events refresh actively. |
| Display | **TUI only** (this session) | TUI already e2e-decrypts and has the SSE stream; the web frontend has no crypto layer (future work). |
| Task excerpt | **Yes** | "Which task is running" needs the prompt text: server extracts it from `UserPromptSubmit` payloads / opencode plugin posts it (160-char one-liner). |

## Architecture as built

```
claude hook (UserPromptSubmit/PostToolUse)  ──sh+curl, raw payload──▶ POST /api/status/claude/running
codex hook (UserPromptSubmit)               ──sh+curl, raw payload──▶ POST /api/status/codex/running
claude/codex hook scripts (Stop, perms…)    ──python urllib, in-proc─▶ POST /api/status/<agent>/<state>
opencode plugin (session/permission events) ──fetch(), in-process───▶ POST /api/status/opencode/<state>
                                                                       + task excerpt on running
notifyhub-push.py (= cli.py)                ──NOTIFYHUB_SESSION_ID──▶ notification data.session_id
all → AgentStatusStore (RAM, per (agent, session_id)) ──SSE `agent_status`──▶ TUI AgentStatusDock
```

Completion notifications now carry `data.session_id`, so the TUI resolves the running row exactly
when the turn's notification lands (verified live: same UUID on both sides).

## Deployment topology discovered along the way

- The backend does **not** run on this machine (wsk). It runs on **nuc** (`nuc.tail0ec64c.ts.net`,
  a *different* tailnet) in Docker (`notifyhub-be-1`, image `lamnguyenx/notifyhub:2026.09.23rev02`,
  from Sept!). This machine reaches it only via the **Tailscale funnel on 443** (SSH/22 initially
  timed out; later ssh worked — tailscale routing was flaky, not blocked).
- Deploy method (no rebuild, per user): `rsync -R` changed files into `nuc:~/git/NotifyHub/`, then
  `docker cp` into the container + `docker restart`. Recorded for the future in the backend doc.

## Implementation history (cross-cutting trials, errors, lessons)

Per-module details live in the module docs. The session-level ones:

### 1. The first smoke test silently posted to the wrong scheme

The local curl-hook smoke test returned `{"agents":[]}` and the uvicorn log said
`Invalid HTTP request received.` — my shell exports `NOTIFYHUB_CLI_SCHEME=https` (funnel setup),
so the hook curled `https://127.0.0.1:9876` at a plain-HTTP server.

**Fix**: run local smoke tests with an explicit coherent env
(`NOTIFYHUB_CLI_HOST=127.0.0.1 NOTIFYHUB_CLI_PORT=9876 NOTIFYHUB_CLI_SCHEME=http`).

**Lesson**: when a client reports "nothing happened", ask what environment it actually resolved —
this machine's bashrc pushes funnel HTTPS defaults into every shell.

### 2. Hot-copying source into an old container crashed it (booleanify)

`docker cp` of the new `config.py` crash-looped the container:
`ModuleNotFoundError: No module named 'booleanify'` — the September image predates that
dependency. Worse, a restart-looping container can't be `docker exec`-ed into, so
`pip install booleanify` inside was impossible.

**Fix** (three steps, in order):
1. Extract the pristine file from the image: `docker run --rm <image> cat /app/src/notifyhub/config.py`.
2. `docker cp` that back over the broken one and restart → backend up again.
3. Make `backend.py` tolerate the field: `getattr(config.backend, "agent_status_stale_seconds",
   DEFAULT_STATUS_STALE_SECONDS)` — the hot-patched surface no longer *requires* the new config.

Also synced `pyproject.toml`/`requirements.txt` to the nuc checkout so the next
`docker compose build be` produces a complete image.

**Lesson**: a hot-patch must be dependency-neutral (don't ship a file with new imports into an
old image); know the `docker run --rm <image> cat <path>` escape hatch; **the container is still
hot-patched — rebuild the image to make it durable** (standing follow-up).

### 3. `claude -p` kills async hooks on exit — Stop state was lost

Live tests showed `UserPromptSubmit → running` arriving but `Stop → idle` never landing for
`claude -p` runs, while interactive sessions were fine. Capturing the raw Stop payload/env
manually showed the hook fires with everything it needs — it just dies before finishing when the
process exits.

**Fix**: `Stop`/`StopFailure` are now `async: false, timeout: 10` with a 5s-capped push spawn.
This is *literally the same failure mode the codex installer already documents* ("codex exec
exits right after the turn and cancels unfinished async hooks").

**Lesson**: read your own adjacent docs before debugging — the answer was already written down
one plugin directory over.

### 4. A NameError silently killed every claude/codex completion notification

After adding session-id passthrough, a live `claude -p` turn produced a status entry but *no*
notification. Synthetic feed → `NameError: name 'payload' is not defined` in `push()` — the
session-id line referenced the caller's variable.

**Fix**: pass `session_id` as an explicit parameter (both plugins).

**Lessons**: (a) unit tests didn't catch it because `main()`'s push path wasn't covered — the
synthetic-payload feed is part of the loop, not a redundant step; (b) "the status worked" is not
"the notification worked" — verify *each* output channel, they fail independently.

### 5. The opencode daemon kept running the old plugin code

`opencode plugin list` showed the new file, but no status posts arrived from `opencode run`.
A temporary debug plugin (logging every event to a file) proved events flow fine in `run` mode —
the persistent server process still held the previously-loaded plugin instance (5 plugin
instances load, one per location — each event arrives 5×; dedup keeps that harmless).

**Fix**: none needed in code — new `opencode` processes load the new plugin; long-lived servers/
TUIs pick it up on their own restart. Documented the caveat in `docs/important/opencode-plugin.md`.

**Lesson**: a resident plugin's "installed" state (disk) and its "running" state (memory) are
different things — prove the new code is actually executing before debugging its logic. The
throwaway debug-plugin that logs to a file is the fastest way to see the real event stream.

### 6. Smaller ones

- **Stale check ordering bug (self-review)**: the first `AgentStatusStore.update` draft computed
  the previous report's age *after* overwriting `updated` — always fresh, never re-announcing.
  Measure, then mutate.
- **`make config-md` is broken** (`NotifyHubConfig.generate_markdown` doesn't exist anymore) —
  pre-existing; `config.md` was updated by hand to its exact table style.
- **`tailscale ping nuc` fails** even when routing works: this machine is on a different tailnet
  (`tail48108e…`), `nuc` resolves only via its full `nuc.tail0ec64c.ts.net` name. MagicDNS
  short names don't cross tailnets.
- **Pre-existing test failures** (3 in `test_config.py` — they assume `NOTIFYHUB_CLI_*` unset,
  this shell exports them; TUI typecheck missing `@types/node`/`bun:test` envs) — verified to
  fail identically on a clean stash before declaring them unrelated.

## Verification matrix

| Check | Result |
|---|---|
| `python -m pytest tests/notifyhub` | 209 pass of 212 collected; the 3 failures are pre-existing env-var assumptions (identical on a clean stash) |
| opencode plugin `tsc --noEmit` | clean |
| TUI `bun test` | 132 pass (incl. 3 new dock render tests) |
| Live claude `-p` turn | running→idle survives exit; task excerpt stored; notification `session_id` == status `session_id` (`929b8c82…`) |
| Live codex `exec` turn | full cycle → idle with hostname |
| Live opencode sessions | real sessions reporting (hanoi-testing-platform, bach) |
| Curl-hook smoke (local uvicorn) | both flavors POST correctly; empty-host mute works |

## Follow-ups

- Rebuild the nuc image (`docker compose build be`) to make the hot-patch durable.
- Commit the session (tree left uncommitted per instruction).
- Restart opencode daemons for the new plugin; re-trust codex hooks if `/hooks` prompts.
- Web frontend surface (needs a WebCrypto decrypt port), stale-watchdog pushes, more agents.
