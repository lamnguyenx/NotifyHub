# Claude Code Hooks

> How NotifyHub integrates with Claude Code — install, behavior, configuration, and the development loop.

Claude Code has no in-process plugin event stream like OpenCode v2. Instead it **spawns hook scripts**
per lifecycle event, passing the event as JSON on stdin. NotifyHub's integration is a single Python
hook script — `src/notifyhub/plugins/claude/notifyhub-claude.py` — registered for four lifecycle points,
which spawns the **same** `notifyhub-push.py` (the NotifyHub CLI) the OpenCode plugin uses.

Port history and the full trials/errors story:
`docs/plans/2026/10/23/2026-10-23-claude-code-hooks-port.md`.

## Requirements

- Claude Code with the hooks system (`/hooks` works in a session)
- `notifyhub-push.py` on disk — installed once via the OpenCode target: `make install-plugin`
  (it is shared by both integrations; Claude Code needs it but has no separate copy)
- NotifyHub server reachable per your `~/.config/notifyhub` config

## Install & verify

```bash
make install-plugin          # once, if not already done: installs the shared notifyhub-push.py
make install-plugin-claude   # merges the NotifyHub hooks into ~/.claude/settings.json
make backend                 # start the local server, if yours runs locally
```

Then **restart running Claude Code sessions** (hooks load at session start — new sessions pick them up
automatically) and verify with `/hooks` inside a session: `Stop`, `StopFailure`, and `Notification`
should be listed under *user settings*.

- The installer is merge-preserving and idempotent: it keeps every other setting and foreign hook, and
  re-running it replaces only NotifyHub's own entries.
- `--dry-run` prints the would-be result; `make remove-plugin-claude` (or `python3
  src/notifyhub/plugins/claude/install.py --remove`) strips exactly the NotifyHub entries.
- Hooks run **from the repo file** (`src/notifyhub/plugins/claude/notifyhub-claude.py`), so edits to
  that file take effect on the next event with no reinstall — the same live-edit property as
  `make install-plugin-symlink` gives the OpenCode plugin.

### Alternative: load as a plugin (no settings edit)

The directory is also a valid Claude Code plugin:

```bash
claude --plugin-dir src/notifyhub/plugins/claude
```

`hooks/hooks.json` registers the same three hooks with `${CLAUDE_PLUGIN_ROOT}` paths while the plugin
is enabled. It can also be published via a marketplace. Both paths run the same hook script.

## Behavior

| Claude Code hook | OpenCode equivalent | Notification sent to NotifyHub |
|---|---|---|
| `Stop` | `session.execution.succeeded` / `interrupted` | `[#tag:@USER] …` + `[#tag:@ASSISTANT] …` (last user + assistant message) |
| `StopFailure` | `session.execution.failed` | `[#claude-code.error] <error message>` |
| `Notification` (`permission_prompt`) | `permission.asked` | `[#claude-code.permission] <message>` |
| `Notification` (`elicitation_dialog` / `elicitation_url_dialog` / `agent_needs_input`) | `form.created` (question tool) | `[#claude-code.question] <message>` |

Details:

- **Turn body**: the assistant excerpt is `last_assistant_message` (delivered with the `Stop` event, no
  transcript race). The user excerpt is recovered from the session transcript (`transcript_path`),
  skipping meta entries (command wrappers, hook injections), sidechain/subagent turns, and
  tool-result-only messages. Truncation matches the OpenCode plugin exactly: **last 5 lines / 200
  chars**, snapping to the nearest space/newline in an 8-char window, prefixing
  `[#truncated:+N LINES]` / `[#truncated:+N CHARS]`.
- **`pwd`**: the hook spawns the push script with the event's `cwd`. Claude Code's `cwd` follows Claude
  into worktrees and after `cd`, so notifications report the real working directory — a session in
  `…/.claude/worktrees/<name>` notifies with the worktree as its directory (title = worktree name).
- **Skip `stop_hook_active`**: a `Stop` caused by another Stop hook continuing the turn is not a
  user-visible completion and does not notify.
- **`idle_prompt` and quota/auth/plugin notification types are deliberately not wired** — a finished
  turn already notified via `Stop`, and the others are not attention requests.
- **Side-effect only**: the hook never writes stdout and always exits 0, so it can never block or alter
  a turn (async-hook stdout is parsed as hook output by Claude Code). Push failures are reported on
  stderr, which lands in the debug log.

## Configuration

Hooks inherit the **Claude Code process environment**, so set variables before launching `claude`:

| Variable | Default | Purpose |
|---|---|---|
| `NOTIFYHUB_CLI_HOST` | `0.0.0.0` | NotifyHub host |
| `NOTIFYHUB_CLI_PORT` | `9080` | NotifyHub port |
| `NOTIFYHUB_CLI_ENABLED` | `true` | `false`/`0`/`off`/`no`/… skips the push-script spawn |
| `NOTIFYHUB_PUSH_SCRIPT` | `~/.config/opencode/plugin/notifyhub-push.py` | Override the CLI path (shared with the OpenCode install) |

Muting follows the same rules as the OpenCode plugin: [booleanify](https://github.com/lamnguyenx/booleanify)
truth tables for `NOTIFYHUB_CLI_ENABLED`, and exporting `NOTIFYHUB_CLI_HOST`/`NOTIFYHUB_CLI_PORT` as
empty strings mutes too. Values are evaluated **per event**, but since each spawn inherits Claude Code's
environment, a change requires launching `claude` with the variable set (or baking it into the hook
`command` in settings).

There is no muted-agents equivalent: Claude Code hooks run in the session's own process, so the
OpenCode plugin's "benchmark `empty` agent on a shared server" dedupe problem does not exist here.

### Immediate permission pings (optional)

`Notification: permission_prompt` respects Claude Code's ~6 s "user appears away" gate before firing.
For an immediate ping on **every** permission request, add a `PermissionRequest` hook (matcher = tool
name) running the same script — the script already handles that event and produces
`[#claude-code.permission] Claude Code needs your permission to use <tool>`.

## Development loop

```bash
cd src/notifyhub/plugins/claude
python3 -m py_compile notifyhub-claude.py install.py   # syntax check (stdlib only, no deps)

# Edit notifyhub-claude.py — hooks spawn a fresh process per event, so the next event uses the edit
```

### Testing without touching the live config

Feed synthetic hook payloads straight into the script with a stub push script:

```bash
cat > /tmp/stub-push.py <<'EOF'
import json, os, sys
print(json.dumps({"argv": sys.argv[1:], "cwd": os.getcwd()}))
EOF

echo '{"hook_event_name":"Stop","stop_hook_active":false,
       "last_assistant_message":"done","cwd":"/tmp","transcript_path":"/nonexistent"}' \
  | NOTIFYHUB_PUSH_SCRIPT=/tmp/stub-push.py python3 notifyhub-claude.py
```

Useful cases: `stop_hook_active: true` (silent), `StopFailure` with `error_details`, `Notification`
with `notification_type` (`permission_prompt`, `idle_prompt` → silent, `elicitation_dialog`), and
`NOTIFYHUB_CLI_ENABLED=false` (silent). For the installer, copy your real settings elsewhere and point
a `SETTINGS_PATH` patch at it, or use `--dry-run`.

## Gotchas

| Symptom | Cause / fix |
|---|---|
| Hooks missing in `/hooks` | `~/.claude/settings.json` failed to parse, or the session predates the install — restart the session; the file watcher also picks up direct edits |
| No notification on a finished turn | `stop_hook_active` was set (a Stop hook continued the turn) — the *next* real Stop notifies |
| Permission ping arrives ~6 s late | By design: `permission_prompt` waits until you appear away; see *Immediate permission pings* |
| Title shows a worktree name | Correct: the session ran in `…/.claude/worktrees/<name>` and `cwd` follows Claude |
| Notification says `~` or the launch dir | The event's `cwd` was missing/falsy — the script falls back to its own cwd |
| Nothing after `claude` restart with mute vars | Hooks inherit Claude Code's environment — `export` the vars **before** launching `claude` |
| `permission_prompt` never fires in the VS Code extension / Desktop | Hosted sessions deliver it ~6 s after the request and skip it if answered sooner; use a `PermissionRequest` hook instead |
| Push errors invisible | `claude --debug` — the hook reports spawn/CLI failures on stderr, which goes to the debug log |

## Differences that matter vs the OpenCode plugin

- No resident process: Claude Code spawns a fresh interpreter per event (cheap enough, and it makes
  edits live); OpenCode streams events into one loaded plugin.
- Turn data arrives as event fields (`last_assistant_message`) plus transcript parsing, instead of
  session API calls.
- No per-location instance dedupe needed (the OpenCode plugin's `ownedSessionDirectory` check exists
  because a global plugin there receives the shared event stream once per open location).
- Muted agents (`plugins.opencode.muted_agents`) have no Claude Code counterpart and are not ported.
- Notification prefixes are `[#claude-code.*]` (vs `[#opencode.*]`) so the dashboards can tell them apart.
