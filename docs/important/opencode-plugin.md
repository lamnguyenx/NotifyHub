# OpenCode v2 Plugin

> How NotifyHub integrates with OpenCode v2 — install, behavior, configuration, and the development loop.

The plugin lives at `src/notifyhub/plugins/opencode/notifyhub-plugin.ts`. It is a **single, dependency-free
TypeScript file** that OpenCode loads from its local plugin directory and that pushes notifications to the
NotifyHub server by spawning `notifyhub-push.py` (the NotifyHub CLI).

Migration history and the full v1 → v2 debugging story: `docs/plans/2026/09/28/2026-09-28-opencode-v2-plugin-migration.md`.
The Claude Code counterpart (hooks port) lives at `src/notifyhub/plugins/claude/` — see
[`claude-code-hooks.md`](claude-code-hooks.md); the OpenAI Codex counterpart lives at
`src/notifyhub/plugins/codex/` — see [`codex-hooks.md`](codex-hooks.md).

## Requirements

- OpenCode **v2.0.18+** (`opencode --version`)
- NotifyHub server running on `http://localhost:9080` (`make backend`)

## Install & verify

```bash
# From the NotifyHub repo root
make install-plugin        # installs OpenCode, shared push CLI, Claude, and Codex
make backend               # start the server (if not already running)

opencode plugin list       # verify: id "notifyhub", state "active"
```

- `make install-plugin-symlink` — symlink instead of copy (live edits, no reinstall)
- `make remove-plugin` — removes the plugin and push script
- `make check-plugin` — show what is installed in `~/.config/opencode/plugin/`

OpenCode v2 discovers plugins from `plugin` or `plugins` directories under the config dir (global), and
`.opencode/plugins/` (project). It watches plugin directories for changes. Restart long-lived server/TUI instances after upgrades
to ensure they load the changed plugin; a watched-file update does not guarantee every running instance refreshed.

## Behavior

| OpenCode v2 event | Notification sent to NotifyHub |
|---|---|
| `session.execution.succeeded` / `session.execution.interrupted` | `[#tag:@USER] …` + `[#tag:@ASSISTANT] …` (last user + assistant message) |
| `session.execution.failed` | `[#opencode.error] <error message>` |
| `permission.asked` | `[#opencode.permission] OpenCode needs your permission` |
| `form.created` | `[#opencode.question] OpenCode is asking you a question` |

Permission alerts and `blocked` status wait one second after `permission.asked`. A matching
`permission.replied` cancels the pending alert; the plugin also checks `ctx.permission.list`
before notifying. This gives the TUI's autoaccept reply time to settle without producing a false
permission notification. The event loop keeps consuming replies during the wait. Idle/completion
and plugin disposal cancel pending alerts, and another outstanding permission keeps the session
blocked when one request is answered.

This is a notification grace period: if a client takes longer than one second to auto-reply, a
still-pending request can notify. The server plugin cannot read the TUI's per-session autoaccept
mode. A `ctx.permission.hook("evaluate")` callback runs before that client reply, so it cannot
identify whether the TUI will answer automatically. NotifyHub observes permissions without
changing their decisions.

The message body is read through `ctx.session.context({ sessionID })` and truncated to the **last 5 lines
and 200 characters**, snapping to the nearest space/newline in an 8-character window and prefixing
`[#truncated:+N LINES]` / `[#truncated:+N CHARS]`. This matches the retired `opencode-trace.py --notifyhub`
preset exactly.

`session.idle` still exists in v2 but is deprecated for **notifications**; the plugin does not
send one on it, so a turn sends exactly one notification. (It *does* subscribe to `session.idle`
for agent-status reporting — see below — where the dedup is a no-op.)

## Agent status reporting

The plugin is the **lifecycle authority** for OpenCode sessions (it sees the server's own event
stream) and reports live state to `POST /api/status/opencode/<state>` in-process — no spawn:

| OpenCode v2 event | Status |
|---|---|
| `session.execution.started` | `running` (attaches a ≤160-char task excerpt read from the session context) |
| `permission.asked` / `form.created` | `blocked` (permissions only after the grace period and pending check) |
| `permission.replied` | `running` |
| `session.idle` / `session.execution.succeeded` / `failed` / `interrupted` | `idle` |

Identical consecutive states are deduped locally; a backend that is down is silently ignored.
Sessions this instance reported `running` are additionally refreshed by an in-process
**heartbeat ticker** (`setInterval`, 60s default): each tick re-posts `running` with
`heartbeat: true` so one long tool call can no longer flip a live card to `stalled?`. Entries
older than the age cap (default 120 min) are dropped and left to go stale — the honest state
for a dead session. `NOTIFYHUB_HEARTBEAT_MAX_MINUTES=0` disables the ticker.
The status body carries `host` using the shared CLI precedence: trimmed `HOST_MODEL` (except
empty or `Unknown`), exported `HOSTNAME`, then OS hostname. Live and completed cards use the same
label, such as `MS-7E70`, without requiring a host header.
Completion pushes now also stamp `NOTIFYHUB_SESSION_ID` (see
[`agent-status.md`](agent-status.md)), so the TUI waiting card resolves when the
notification lands ([waiting cards plan](../plans/2026/11/11/2026-11-11-tui-waiting-cards.md)).
One plugin instance loads per OpenCode location and each receives every event — only the instance
whose location owns the session reports, others stay silent (`ownedSessionDirectory` guard).

> **Restart caveat**: OpenCode hot-reloads *watched plugin files* for new processes, but a
> long-lived shared server (`opencode serve`) or running TUI keeps the previously-loaded plugin
> instance until it restarts. If status posts stop after upgrading the plugin, restart OpenCode.

## Configuration

The plugin reads environment variables from the OpenCode server process, so set them before launching
OpenCode:

| Variable | Default | Purpose |
|---|---|---|
| `NOTIFYHUB_CLI_HOST` | `0.0.0.0` | NotifyHub host |
| `NOTIFYHUB_CLI_PORT` | `9080` | NotifyHub port |
| `NOTIFYHUB_CLI_ENABLED` | `true` | `false`/`0`/`off`/`no`/… mutes all notifications |
| `NOTIFYHUB_HEARTBEAT_INTERVAL_MS` | `60000` | Heartbeat cadence for running sessions (1s floor) |
| `NOTIFYHUB_HEARTBEAT_MAX_MINUTES` | `120` | Orphan cap for running entries; `0` disables the heartbeat |
| `NOTIFYHUB_PUSH_SCRIPT` | `~/.config/opencode/plugin/notifyhub-push.py` | Override the CLI path (project-level installs, tests) |
| `VERBOSE_INT` | `0` | Forwarded to the NotifyHub CLI |

### Muting specific agents

Sessions whose OpenCode agent is listed in `plugins.opencode.muted_agents` never notify. The plugin
reads the list live from the NotifyHub config (`~/.config/notifyhub/config.json` or `config.jsonl`,
comments allowed); `NOTIFYHUB_PLUGINS_OPENCODE_MUTED_AGENTS` (comma-separated) overrides the file,
mirroring confstack's file-then-env layering. The default is `["empty"]` — the `empty` agent is the
raw model-completion endpoint the Midscene AndroidWorld benchmark uses for every call, so its turns
would otherwise notify while real chats sharing the same server still do.

```json
{
  "plugins": {
    "opencode": {
      "muted_agents": ["empty"]
    }
  }
}
```

Set `"muted_agents": []` to notify for every agent.

Muting: `NOTIFYHUB_CLI_ENABLED=false` — or exporting `NOTIFYHUB_CLI_HOST`/`NOTIFYHUB_CLI_PORT` as
empty strings — skips the push-script spawn entirely; the CLI applies the same rules when invoked
directly and exits `0` silently. Values are parsed with
[booleanify](https://github.com/lamnguyenx/booleanify); empty means enabled, and an unparseable
value exits `1` with a clean `✗ Invalid config` message.

## Development loop

```bash
cd src/notifyhub/plugins/opencode

npm install            # once — @opencode/plugin types + TypeScript
npm run typecheck      # tsc --noEmit, strict

# Edit notifyhub-plugin.ts — OpenCode hot-reloads the installed file
```

Key constraint: **keep the import type-only**.

```ts
import type { Plugin } from "@opencode/plugin"   // ✅ erased at runtime, no node_modules needed
// import { Plugin } from "@opencode/plugin"     // ❌ resolved from the plugin file dir → fails to load
```

OpenCode resolves bare imports in a local plugin relative to the plugin file itself. `~/.config/opencode/`
has no `node_modules`, so a runtime import of `@opencode/plugin` breaks the install. The loader only needs
the default export shape:

```ts
const plugin: Plugin.Plugin = {
  id: "notifyhub",
  setup: async (ctx) => {
    for await (const event of ctx.event.subscribe({ signal })) { … }
    return () => controller.abort()
  },
}
export default plugin
```

### Testing without touching the live config

Plugin loading and event handling can be exercised against an isolated OpenCode instance:

```bash
mkdir -p /tmp/oc-test/plugin
cp notifyhub-plugin.ts /tmp/oc-test/plugin/
cp /path/to/fake-push.py /tmp/oc-test/fake-push.py   # logs argv and exits 0

OPENCODE_CONFIG_DIR=/tmp/oc-test \
OPENCODE_PASSWORD=testpass \
NOTIFYHUB_PUSH_SCRIPT=/tmp/oc-test/fake-push.py \
opencode serve --hostname 127.0.0.1 --port 9199
```

Then drive it over the API (Basic auth `opencode:testpass`):

- `POST /api/session` — boots the instance and activates plugins
- `POST /api/session/:id/form` with `{ title, fields }` — triggers `form.created`
- `POST /api/session/:id/model` with `{ model: { id, providerID } }`, then `POST /api/session/:id/prompt`
  with `{ text }` — trigger a canned `session.execution.failed` using a bogus model (never spends tokens)

## Gotchas

| Symptom | Cause / fix |
|---|---|
| `opencode plugin list` shows nothing | Plugins load when an instance boots; create/run a session first |
| Plugin missing from the list after restart | Check `state`; a failed load shows `status: failed` with an error ref |
| `Cannot find package '@opencode/plugin'` | Runtime import instead of `import type` — see above |
| `opencode plugin list --standalone` fails | `--standalone` is a root flag; use `opencode api --standalone …` or a served instance |
| HTTP 401 from a manually started server | Use Basic auth `opencode:<password>`; password is printed on start or set via `OPENCODE_PASSWORD` |
| Prompt API returns `Missing key at ["text"]` | Body is flattened: `{ "text": "…" }`, not `{ "prompt": { … } }` |
| `switchModel` says `Missing key at ["model"]["id"]` | `Model.Ref` uses `{ id, providerID }`, not `modelID` |
| `npx tsc --noEmit file.ts` reports module errors | Passing files ignores `tsconfig.json`; run `npm run typecheck` |
| No notification when a **subagent** finishes | Child sessions notify too (by design, matching v1) — filter by `parentID` if unwanted |

## v1 → v2 differences that matter

- Package rename: `@opencode-ai/plugin@1.x` → `@opencode/plugin@2.x`.
- Hook object (`{ event, "tool.execute.before" }`) → `{ id, setup }` default export with imperative hooks
  (`ctx.event.subscribe`, `ctx.tool.hook`, `ctx.permission.hook`, `ctx.session.hook`, …).
- `event.properties` → `event.data`.
- `session.error` → `session.execution.failed`; `session.idle` → `session.execution.succeeded`
  (deprecated but still emitted).
- `question.asked` → `form.created` (questions are backed by the Form service).
- `permission.updated` no longer exists.
- `opencode-trace.py` was retired: v2 replaced `session` / `message` / `part` with `session_v2` /
  `session_message`; the notification body now comes from the plugin session API.

OpenCode plugin regression checks (no live server or model requests):

```bash
bun test ./tests/notifyhub/plugins/opencode_plugin.test.ts
npm run typecheck --prefix src/notifyhub/plugins/opencode
```

## Current maintenance references

- [Install all integrations](plugin-installation.md)
- [Machine labels](notification-machine-labels.md)
- [Isolated regression checks](plugin-integration-testing.md)
- [2026-11-12 module record](../plans/2026/11/12/2026-11-12-plugin-labels-installation-and-permissions-opencode.md)
