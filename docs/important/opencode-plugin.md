# OpenCode v2 Plugin

> How NotifyHub integrates with OpenCode v2 — install, behavior, configuration, and the development loop.

The plugin lives at `src/notifyhub/plugins/opencode/notifyhub-plugin.ts`. It is a **single, dependency-free
TypeScript file** that OpenCode loads from its local plugin directory and that pushes notifications to the
NotifyHub server by spawning `notifyhub-push.py` (the NotifyHub CLI).

Migration history and the full v1 → v2 debugging story: `docs/plans/2026/09/28/2026-09-28-opencode-v2-plugin-migration.md`.

## Requirements

- OpenCode **v2.0.18+** (`opencode --version`)
- NotifyHub server running on `http://localhost:9080` (`make backend`)

## Install & verify

```bash
# From the NotifyHub repo root
make install-plugin        # copies notifyhub-plugin.ts + notifyhub-push.py
make backend               # start the server (if not already running)

opencode plugin list       # verify: id "notifyhub", state "active"
```

- `make install-plugin-symlink` — symlink instead of copy (live edits, no reinstall)
- `make remove-plugin` — removes the plugin and push script
- `make check-plugin` — show what is installed in `~/.config/opencode/plugin/`

OpenCode v2 discovers plugins from `plugin` or `plugins` directories under the config dir (global), and
`.opencode/plugins/` (project). It **watches the directory and hot-reloads changed plugin files** — no
restart needed for edits.

## Behavior

| OpenCode v2 event | Notification sent to NotifyHub |
|---|---|
| `session.execution.succeeded` / `session.execution.interrupted` | `[#tag:@USER] …` + `[#tag:@ASSISTANT] …` (last user + assistant message) |
| `session.execution.failed` | `[#opencode.error] <error message>` |
| `permission.asked` | `[#opencode.permission] OpenCode needs your permission` |
| `form.created` | `[#opencode.question] OpenCode is asking you a question` |

The message body is read through `ctx.session.context({ sessionID })` and truncated to the **last 5 lines
and 200 characters**, snapping to the nearest space/newline in an 8-character window and prefixing
`[#truncated:+N LINES]` / `[#truncated:+N CHARS]`. This matches the retired `opencode-trace.py --notifyhub`
preset exactly.

`session.idle` still exists in v2 but is deprecated; the plugin deliberately does **not** subscribe to it,
so a turn sends exactly one notification.

## Configuration

The plugin reads environment variables from the OpenCode server process, so set them before launching
OpenCode:

| Variable | Default | Purpose |
|---|---|---|
| `NOTIFYHUB_CLI_HOST` | `0.0.0.0` | NotifyHub host |
| `NOTIFYHUB_CLI_PORT` | `9080` | NotifyHub port |
| `NOTIFYHUB_PUSH_SCRIPT` | `~/.config/opencode/plugin/notifyhub-push.py` | Override the CLI path (project-level installs, tests) |
| `VERBOSE_INT` | `0` | Forwarded to the NotifyHub CLI |

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
