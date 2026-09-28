# OpenCode v2 Plugins

This directory contains NotifyHub's plugin for [OpenCode](https://opencode.ai) **v2**.

## 🔔 NotifyHub Plugin

**File:** `notifyhub-plugin.ts`

Sends notifications to a local NotifyHub server whenever OpenCode needs attention or finishes a turn.

**Requirements:**

- OpenCode **v2.0.18+** (`opencode --version`)
- A NotifyHub server (default `http://localhost:9080`)

**Notifications:**

| OpenCode v2 event                            | Notification                                             |
| -------------------------------------------- | -------------------------------------------------------- |
| `session.execution.succeeded`, `interrupted` | `[#tag:@USER] …` + `[#tag:@ASSISTANT] …` message excerpts |
| `session.execution.failed`                    | `[#opencode.error] <error message>`                       |
| `permission.asked`                            | `[#opencode.permission] OpenCode needs your permission`   |
| `form.created` (the `question` tool)          | `[#opencode.question] OpenCode is asking you a question`  |

Turn-completion bodies are read through `ctx.session.context({ sessionID })` and truncated to the last
5 lines / 200 characters (the same rules the retired `opencode-trace.py --notifyhub` preset used).

The `pwd` sent to NotifyHub (shown as the notification's directory tag) is the **session's** directory,
resolved through `ctx.session.get({ sessionID })`. `notifyhub-push.py` is spawned with that directory
as its `cwd`, so a background `opencode serve` running from `~` no longer makes notifications report
the home directory.

Because the plugin lives in the global config directory, OpenCode loads one instance per open
location and every instance receives the shared event stream. The plugin therefore only handles an
event when the session's location directory matches the instance's own `ctx.location.directory`;
otherwise the same event would notify once per open location, with non-matching instances falling
back to their own directory (for example `~`).

## Installation

```bash
# From the NotifyHub repository root
make install-plugin

# Start the NotifyHub server
make backend

# Open the dashboard
open http://localhost:9080
```

`make install-plugin` copies two files into `~/.config/opencode/plugin/`:

- `notifyhub-plugin.ts` — the OpenCode v2 plugin
- `notifyhub-push.py` — the NotifyHub CLI entrypoint the plugin spawns

OpenCode watches the plugin directory, so no manual restart is usually needed. Verify the plugin is
active with:

```bash
opencode plugin list
# … "id":"notifyhub","source":{"type":"local",…},"state":{"status":"active"}
```

**Management:**

- `make install-plugin` — copy the plugin and push script
- `make install-plugin-symlink` — symlink instead of copy (live edits)
- `make remove-plugin` — remove the plugin and push script
- `make check-plugin` — list installed plugin files

**Disabling:** remove the files, or add `"-notifyhub"` to the `plugin` list in `opencode.json`.

## Configuration

The plugin reads these environment variables from the OpenCode server process, so set them before
launching OpenCode:

| Variable                | Default                                      | Purpose                              |
| ----------------------- | -------------------------------------------- | ------------------------------------ |
| `NOTIFYHUB_CLI_HOST`    | `0.0.0.0`                                    | NotifyHub host                       |
| `NOTIFYHUB_CLI_PORT`    | `9080`                                       | NotifyHub port                       |
| `NOTIFYHUB_PUSH_SCRIPT` | `~/.config/opencode/plugin/notifyhub-push.py` | Override the CLI path (project installs) |
| `VERBOSE_INT`           | `0`                                          | Forwarded to the NotifyHub CLI       |

## Development

```bash
# Install TypeScript types for the v2 plugin API
npm install

# Type check the plugin
npm run typecheck
```

`notifyhub-plugin.ts` uses a **type-only** import of `@opencode/plugin`, so the installed file has no
runtime dependency on `node_modules` and works as a single-file local plugin. The loader only needs
the default export shape required by OpenCode v2:

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

## v1 → v2 Migration Notes

- Plugin packages were renamed: `@opencode-ai/plugin@1.x` → `@opencode/plugin@2.x`.
- The v1 hooks object (`{ event, "tool.execute.before" }`) was replaced by
  `{ id, setup }` default exports that register hooks imperatively (`ctx.event.subscribe`,
  `ctx.tool.hook`, `ctx.permission.hook`, `ctx.session.hook`, …).
- v1 events were renamed: `session.idle` → `session.execution.succeeded`
  (`session.idle` is deprecated in v2 but still emitted), `session.error` → `session.execution.failed`,
  and `question.asked` → `form.created`.
- `opencode-trace.py` was retired: v2 replaced the `session` / `message` / `part` SQLite tables with
  `session_v2` / `session_message`, and the notification body is now built in TypeScript through the
  v2 session API. The old script remains available in git history.

## Troubleshooting

- Ensure the NotifyHub server is running and reachable: `curl http://localhost:9080/api/notifications`
- Confirm the plugin is loaded: `opencode plugin list`
- Plugin errors are printed to the OpenCode server's stderr (the push script uses `stdio: "inherit"`)
- If no notifications arrive, check that `notifyhub-push.py` exists at the configured path and is
  executable
- **Duplicate notifications:** the plugin is global, so OpenCode loads one instance per open location
  and every instance sees the shared event stream. The plugin only notifies for the instance whose
  `ctx.location.directory` matches the session, so a duplicate usually means a stale instance is still
  running — restart the service: `opencode service restart`.
- **Edits not taking effect:** with a symlinked install (`make install-plugin-symlink`) OpenCode's file
  watcher does not always notice changes to the symlink target. Restart the service, or use
  `make install-plugin-copy` if you rely on hot-reload.

## Related

- [OpenCode](https://opencode.ai) — the coding agent this plugin extends
- [NotifyHub](../..) — the notification server
- [OpenCode v2 plugin guide](../../../../docs/important/opencode-plugin.md) — install, config, gotchas
- [Migration plan](../../../../docs/plans/2026/09/28/2026-09-28-opencode-v2-plugin-migration.md) — v1 → v2 history
- [OpenCode Plugin Docs](https://opencode.ai/docs/plugins)
