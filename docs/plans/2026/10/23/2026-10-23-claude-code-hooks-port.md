# Claude Code Hooks Port

**Date**: 2026-10-23
**Status**: Done (installed and verified end-to-end)

## Goal

Give **Claude Code** the same NotifyHub notifications the OpenCode v2 plugin provides — turn completion
with user/assistant excerpts, API errors, permission prompts, and questions — by porting
`src/notifyhub/plugins/opencode/notifyhub-plugin.ts` to Claude Code's extension mechanism.

Operator-facing guide: `docs/important/claude-code-hooks.md`.

## Context: Claude Code is event-spawn, not event-subscribe

Research question: *"Claude Code did this for OpenCode — is the same thing possible?"*

OpenCode v2 loads one resident TypeScript plugin per location and streams it every server event through
`ctx.event.subscribe()`. Claude Code has **no in-process event-stream plugin API**; instead it spawns
**hook handlers** per lifecycle event, passing event JSON on stdin, and reads stdout/exit code back.
There is also a plugin format (`.claude-plugin/plugin.json` + `hooks/hooks.json`), but it is a packaging
wrapper around the same hook events — not a resident API.

That single difference shaped the whole port:

| Concern | OpenCode plugin | Claude Code port |
|---|---|---|
| Runtime shape | one resident `.ts` file, async iterator over events | spawned-per-event Python script, JSON on stdin |
| Turn body | `ctx.session.context()` + `ctx.session.get()` API calls | `last_assistant_message` field free on `Stop`; user text parsed from `transcript_path` JSONL |
| Session dir | `session.location.directory` + `subpath` via API | `cwd` field in hook payload (worktree-aware) |
| Dedupe | needed (global plugin = one instance per open location) | not needed (hooks run in the session's own process) |
| Delivery | identical: spawn `notifyhub-push.py` (CLI) with session dir as cwd |

### Event mapping (verified against the live hooks reference)

| OpenCode v2 event | Claude Code hook | Notification |
|---|---|---|
| `session.execution.succeeded` / `interrupted` | `Stop` | `[#tag:@USER] …` + `[#tag:@ASSISTANT] …` |
| `session.execution.failed` | `StopFailure` | `[#claude-code.error] <error>` |
| `permission.asked` | `Notification` matcher `permission_prompt` | `[#claude-code.permission] <message>` |
| `form.created` (question tool) | `Notification` matchers `elicitation_dialog`\|`elicitation_url_dialog`\|`agent_needs_input` | `[#claude-code.question] <message>` |

Key schema facts the port relies on:

- `Stop` carries `last_assistant_message` (final text, no transcript race) and `stop_hook_active`
  (true when another Stop hook continued the turn → skip, avoids double-notify).
- `StopFailure.last_assistant_message` holds the **rendered error text** (`"API Error: …"`), unlike on
  `Stop` where it is conversational output — used directly as the error body.
- `Notification` matcher filters on `notification_type`; the four wired types differ from `idle_prompt`
  (already covered by `Stop`) and quota/auth/plugin types (not attention requests). `permission_prompt`
  is gated ~6 s by Claude Code until the user "appears away" — acceptable UX, immediate variant available
  via an unwired `PermissionRequest` handler.
- Hook output is **parsed as JSON decisions**; on async hooks, stdout is parsed as a hook response whose
  fields get delivered into the next turn. So the hook script must be strictly side-effect: never write
  stdout, always exit 0. Failures go to stderr (→ debug log).
- Hooks inherit the **Claude Code process environment**, so mute env vars must exist before `claude` launches.

## Final State

`src/notifyhub/plugins/claude/`:

- **`notifyhub-claude.py`** — the hook script (Python stdlib only, dependency-free). Byte-for-byte port
  of `truncateText` (last 5 lines / 200 chars, 8-char word-snap, `[#truncated:…]` markers), same
  booleanify mute table + empty-host/port mute, spawns the **shared** `notifyhub-push.py` with the
  payload `cwd` so the notification `pwd` is the session/worktree directory. Handles `Stop`,
  `StopFailure`, `Notification`, and `PermissionRequest` (documented, not wired).
- **`install.py`** — merges hook entries into `~/.claude/settings.json`: preserves all foreign settings
  and hooks, idempotent (replaces only entries whose command points at our script), `--dry-run`,
  `--remove` drops our entries and the `hooks` key when nothing remains.
- **`hooks/hooks.json` + `.claude-plugin/plugin.json`** — identical hooks in Claude Code plugin layout
  (`${CLAUDE_PLUGIN_ROOT}` paths) for `--plugin-dir` / marketplace distribution with no settings edit.
- User text recovery from transcript JSONL: last non-empty user message, skipping `isMeta` entries
  (command wrappers, hook injections), `isSidechain` (subagent turns), and tool-result-only content.

Makefile: `install-plugin-claude` / `remove-plugin-claude` (added to `.PHONY`). Root README: "Claude Code
Hooks (Optional)" section. Operator guide: `docs/important/claude-code-hooks.md`.

Installed state on this machine: `~/.claude/settings.json` carries the three hooks pointing **at the
repo file** (live edits, like the symlinked push script); pre-install backup at
`~/.claude/settings.json.bak-notifyhub-*`. Push script comes from the OpenCode target
(`make install-plugin`, symlinked to `src/notifyhub/cli/cli.py`).

## Implementation history (trials and errors)

### Step 0: Docs discovery was a maze of truncated fetches

The hooks reference is one ~4k-line page. Fetches kept arriving truncated and split across tool-output
files, one fetch was 404 (`hooks-reference` vs `hooks`), and section anchors differed between fetches, so
`awk '/^### Stop$/…'` silently matched nothing.

**Fix**: fetched the full page once via the platform `webfetch` (saved whole by the harness), then
`grep -n '^### '` to index sections before `sed`-ing ranges by line number.

**Lesson**: index a large saved document by line number first; don't guess anchors or re-fetch.

### Step 1: The write tool refused pure-JSON content

Writing `hooks.json` / `plugin.json`, the `write` tool rejected the call with *"content: Expected string"*
three times — a JSON document passed as content was being parsed into an object before reaching the tool.

**Fix**: created both files with shell heredocs (`cat > file <<'EOF'`), then validated with
`python3 -m json.tool`.

**Lesson**: for single-file JSON artifacts, heredoc + validator beats fighting the tool layer.

### Step 2: Heredoc failed — parent dirs didn't exist

First heredoc run died with *"No such file or directory"*: the failed `write` attempts had never created
`hooks/` and `.claude-plugin/` (they abort before the mkdir step). Fixed with an explicit `mkdir -p` —
and then that very shell call was interrupted mid-run by a harness shutdown ("location shut down"),
leaving only `notifyhub-claude.py` on disk.

**Fix**: `find`-checked what survived, recreated the two JSON files, validated, moved on.

**Lesson**: after any interrupted/interrupted-looking operation, enumerate the expected end state and
reconcile file-by-file instead of assuming.

### Step 3: The first end-to-end test "produced nothing"

Fed synthetic payloads through the hook with a stub push script printing to stdout — zero output, looked
broken. It wasn't: the hook **captures** child stdout and only speaks on failure (by design, Step "side
effect only"). The test rig, not the code, was unverifiable.

**Fix**: rewrote the stub to append to a log file, re-ran the six cases (Stop / `stop_hook_active` skip /
StopFailure / permission / idle-skip / elicitation), and asserted on the log.

**Lesson**: to observe a deliberately-silent process, make the observation target a side channel (log
file), not the silenced channel.

### Step 4: The installer's `--remove` test silently tested install

Testing `install.py` via `importlib`, I assigned a fake `args` namespace and called `main()` — for
`--remove` too. But `main()` **re-parses `sys.argv`** itself, so my fake namespace was ignored and every
call ran the install path (output even said "installed"; a `len(hooks['Stop']) == 1` idempotency check
coincidentally still passed, masking it).

**Fix**: re-ran with `sys.argv = ["install.py", "--remove"]`. Removal worked: our entries gone, `hooks`
key dropped, `modelSettings`/`theme` intact.

**Lesson**: when a module self-parses argv, drive tests through the real argv (or subprocess), never by
patching the parsed attribute. Also read success messages — "installed" during a removal test was the
tell.

### Step 5: Real-CLI smoke test "failed" — but proved the chain

End-to-end with the real `notifyhub-push.py`: hook spawned the CLI, which loaded confstack config and
tried the configured tailnet server → *"Network error: Failed to connect"* on stderr, exit ≠ 0.
That error message is the push path working exactly as designed (mute logic skipped, config loaded,
request attempted, failure reported on the right channel). The server was simply unreachable at that
moment; later it responded 200. Second surprise: `localhost:9080` isn't this machine's server at all —
confstack points at `https://nuc.tail0ec64c.ts.net`.

**Fix**: none needed to the code; re-tested when the tailnet host was reachable. Final smoke test posted
a real notification (visible in `/api/notifications` as E2E ciphertext — the e2e config working).

**Lesson**: "failure" output can still verify a full pipeline; and know which server the config actually
targets before assuming localhost.

### Step 6: "The title says claude worktree — it's wrong" (it wasn't)

First live notification's title read like a worktree name. Turned out the Claude Code session genuinely
ran inside `…/.claude/worktrees/<name>`: Claude Code's hook `cwd` **follows Claude into worktrees**
(`${CLAUDE_PROJECT_DIR}` stays at the original root; `cwd` is the worktree after entering). NotifyHub
titles are `pwd.split('/').pop()`, so the worktree name as title is correct behavior, consistent with
how the OpenCode plugin reports session subpaths.

**Lesson**: verify the session's actual location before diagnosing "wrong" notification fields; Claude
Code worktrees live under `.claude/worktrees/` inside the repo.

## Design decisions worth remembering

1. **Side-effect-only hook**: never stdout, always exit 0. Claude Code parses async-hook stdout as a
   JSON response and can deliver stray fields into the next turn; a non-zero exit counts as hook failure.
2. **`stop_hook_active` skip**: Stop-hook-driven continuations are not user-visible completions.
3. **`Notification` over `PermissionRequest`** as the default wiring: permission prompts stay behind
   Claude Code's ~6 s "appears away" gate instead of pinging on every request; the immediate variant is
   one settings entry away (already implemented in the script).
4. **No muted-agents port**: Claude Code has no equivalent of benchmark `empty`-agent traffic on a
   shared server; the mute env vars it *does* share (`NOTIFYHUB_CLI_ENABLED`, empty host/port) are
   honored per spawn.
5. **Hooks point at the repo file**, not a copy — same live-edit property as the symlinked push script
   from `make install-plugin-symlink`.
6. **Two distribution paths, one payload builder**: settings merge (single machine, smallest step) and
   plugin layout (marketplace/`--plugin-dir`, zero settings edit) both call the same
   `notifyhub-claude.py`.

## Lessons learnt (condensed)

- Port the **behavior**, not the mechanism: map each source event to the target's closest lifecycle
  point, then adapt data access (`session.context()` API → stdin fields + transcript JSONL).
- Read the target's hook contract end-to-end before writing code — the stdout/exit-code/async rules
  constrain design more than the event list does.
- A port is done when its *error paths* are verified (mute, bad JSON, unreachable server), not just its
  happy path.
- Doc-drift is real on both platforms: trust fetched live references over memory, and index large docs
  by line number.

## Related

- Source of the port: `src/notifyhub/plugins/opencode/notifyhub-plugin.ts`
- Operator guide: `docs/important/claude-code-hooks.md`
- OpenCode migration history: `docs/plans/2026/09/28/2026-09-28-opencode-v2-plugin-migration.md`
