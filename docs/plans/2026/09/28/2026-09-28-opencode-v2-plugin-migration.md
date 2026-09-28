# OpenCode v2 Plugin Migration

**Date**: 2026-09-28
**Status**: Done

## Goal

Migrate `src/notifyhub/plugins/opencode/` from OpenCode's v1 plugin API to the OpenCode **v2** plugin API
(target: `@opencode/plugin@2.0.18`, OpenCode `2.0.18`), keep every existing notification behavior, and
retire the SQLite-based `opencode-trace.py` that v2 made unusable.

Operator-facing guide: `docs/important/opencode-plugin.md`.

## Context: what we found before writing code

| Area | v1 (old target) | v2 (new target) |
|---|---|---|
| Plugin package | `@opencode-ai/plugin@1.18.32` | `@opencode/plugin@2.0.18` |
| Plugin shape | exported function returning a hooks object | default export `{ id, effect \| setup }` |
| Events | `event` hook receives `{ properties }` | `ctx.event.subscribe()` async iterator, payload `{ data }` |
| Turn done | `session.idle` | `session.execution.succeeded` (`session.idle` deprecated) |
| Errors | `session.error` | `session.execution.failed` |
| Questions | `question.asked` / `question` tool | `form.created` (questions became forms) |
| Permissions | `permission.asked` / `permission.updated` | `permission.asked` (no `updated`) |
| Message storage | SQLite `session` / `message` / `part` | SQLite `session_v2` / `session_message` |
| Notification body | `opencode-trace.py` queried SQLite | `ctx.session.context({ sessionID })` |

Decision (confirmed with the user): target **v2.0.18**, do a **full TypeScript rewrite** and drop SQLite,
keep the existing Python CLI (`notifyhub-push.py`) as the delivery mechanism.

## Final State

`src/notifyhub/plugins/opencode/notifyhub-plugin.ts` is a dependency-free single file:

```ts
import type { Plugin } from "@opencode/plugin"   // type-only → erased at runtime

const plugin: Plugin.Plugin = {
  id: "notifyhub",
  setup: async (ctx) => {
    const controller = new AbortController()
    void (async () => {
      for await (const event of ctx.event.subscribe({ signal: controller.signal })) { … }
    })()
    return () => controller.abort()
  },
}

export default plugin
```

| OpenCode v2 event | Notification |
|---|---|
| `session.execution.succeeded` / `interrupted` | `[#tag:@USER] …` + `[#tag:@ASSISTANT] …`, last 5 lines / 200 chars |
| `session.execution.failed` | `[#opencode.error] <event.data.error.message>` |
| `permission.asked` | `[#opencode.permission] OpenCode needs your permission` |
| `form.created` | `[#opencode.question] OpenCode is asking you a question` |

Also changed:

- **Deleted** `opencode-trace.py` (v2 replaced its tables and deprecated its data path).
- `package.json`: `@opencode/plugin@^2.0.18`, explicit `@types/node`, `npm run typecheck` script.
- `tsconfig.json`: `"strict": true`.
- `Makefile`: `install-plugin*` / `remove-plugin` no longer reference `opencode-trace.py`; `rm -f` for safe removal.
- Added `NOTIFYHUB_PUSH_SCRIPT` env override so the push script path can be relocated (needed for isolated
  testing and for project-level plugin installs).
- Rewrote `src/notifyhub/plugins/opencode/README.md`; touched up root `README.md`.

## Implementation history (trials and errors)

### Step 0: The reference checkout was v1, not v2

`_refs/opencode` pointed at a checkout of the **`dev` branch at v1.18.32** — not v2. `git describe`
reported `github-v1.2.25-2079-gb471c2b449`, and `packages/plugin/package.json` was `@opencode-ai/plugin@1.18.32`.

**Trial**: read `packages/plugin/src/v2/promise/*` on that branch first. It exists, but it is an
incomplete, preliminary API (`agent/catalog/command/integration/reference/skill` transforms + `aisdk`
hooks, no `event`, no `session`, no `permission`, no `tool` hooks). Designing against it would have
produced a plugin that could not notify at all.

**Fix**: found the real v2 line via `git tag --sort=-creatordate` (`v2.0.18`, released 2026-09-25) and
read it with `git show v2.0.18:…`. Confirmed the npm package rename (`npm view @opencode/plugin` →
2.0.18, `npm view @opencode-ai/plugin` → 1.18.32).

**Lesson**: when a repo is handed over as a reference, verify the checked-out branch/tag/version
before designing against it.

### Step 1: The v2 loader rejects the old plugin shape

`packages/core/src/plugin/module.ts` decodes the module as
`{ default: { id, effect } | { id, setup } }`. The v1 pattern (`export const NotifyHub: Plugin = async (ctx) => ({ event, "tool.execute.before" })`)
is not accepted — the v2 docs (`packages/web/src/content/docs/plugins.mdx`) on the same tag still showed
the v1 hooks example and were **stale**. Trusted the code over the docs.

Also confirmed via `packages/core/src/plugin/source-directory.ts` that v2 still discovers local files from
`{plugin,plugins}/` under the config dir, so the existing `~/.config/opencode/plugin/` install path and the
Makefile were still valid.

### Step 2: Runtime import of `@opencode/plugin` would break local installs

First version used `import { Plugin } from "@opencode/plugin"` + `Plugin.define({ … })`. Reading
`packages/plugin/src/source.node.ts` and `source.package.ts` showed that bare specifiers in a local plugin
resolve with Node resolution **from the plugin file's own directory**. `~/.config/opencode/` has no
`node_modules`, so the plugin would fail to load with "Cannot find package '@opencode/plugin'".

**Fix**: switched to `import type { Plugin } from "@opencode/plugin"` (erased) and a plain object literal
typed `Plugin.Plugin`. The loader only needs `{ id, setup }` — it does not require `Plugin.define`.

Typing the context then needed a new approach, because `typeof Plugin.define` is no longer a value:

```ts
type PluginContext = Plugin.Context
type SessionMessage = Awaited<ReturnType<PluginContext["session"]["context"]>>[number]
```

Verified with a no-`node_modules` smoke test:

```bash
node --experimental-strip-types -e "import('./notifyhub-plugin.ts').then(m => console.log(m.default.id))"
# notifyhub
```

**Lesson**: for local file plugins, prefer type-only imports so the installed artifact is self-contained.

### Step 3: Event mapping changed semantics, not just names

- `session.idle` still exists in v2 but is marked `// deprecated` in `session-status-event.ts`; the
  live signal is `session.execution.succeeded`. Subscribed only to `session.execution.*` to avoid
  double notifications.
- `question.asked` no longer exists as an event; questions go through `Form.Service.ask()` →
  `form.created` (confirmed in `packages/core/src/tool/plugin/question.ts` and `packages/schema/src/form.ts`).
- Event payload keys changed: `event.properties` (v1) → `event.data` (v2), envelope is
  `{ id, created, type, location, data }`.
- `exception`: `event.data.error.message` for `session.execution.failed`.

### Step 4: Retiring `opencode-trace.py`

The script queried `session`, `message`, and `part` with `data` JSON columns. v2's drizzle schema is
`session_v2`, `session_message` (type + `data`), `session_inbox`, etc. Porting was possible but the v2
plugin API exposes `ctx.session.context({ sessionID })` returning `PublicSessionMessage[]`, so the whole
script became unnecessary.

Ported the formatting rules 1:1 (last 5 lines, 200 chars, 8-char snap to space/newline, `[#truncated:…]`
prefixes) and kept `[#tag:@USER]` / `[#tag:@ASSISTANT]` output identical.

### Step 5: Truncation parity test

Wrote a throwaway differential harness (Python reference vs exported TypeScript `truncateText`) with 12
cases: empty, single line, 7 lines, 500-char no-space, space snap, prefix snap, unicode (`café`/`é`),
multi-line long, and whitespace-only input.

Result: **12/12 match** — the port is behaviorally identical to the old `--notifyhub` preset.

Two TypeScript gotchas during this step:

- `npx tsc --noEmit notifyhub-plugin.ts` **ignores `tsconfig.json`** when file arguments are given, so it
  reported a bogus `moduleResolution` error. Use `npx tsc --noEmit` / `npm run typecheck` instead.
- `Array.prototype.findLast` needs `lib: ES2023`; used a reverse `for` loop instead to stay on `ES2022`.

### Step 6: Testing against a real OpenCode v2.0.18 server

Installed OpenCode 2.0.18 was available on the machine, so the plugin was tested for real — but not
against the user's live config (their `plugin`/`plugins` dirs are intentionally moved to `.disabled`).

Test rig:

```bash
# isolated config dir containing only our plugin
mkdir -p /tmp/opencode/oc-config/plugin
cp notifyhub-plugin.ts /tmp/opencode/oc-config/plugin/

OPENCODE_CONFIG_DIR=/tmp/opencode/oc-config \
OPENCODE_PASSWORD=testpass \
NOTIFYHUB_PUSH_SCRIPT=/tmp/opencode/fake-push.py \
opencode serve --hostname 127.0.0.1 --port 9199
```

Trials and errors along the way:

1. `opencode plugin list --standalone` → `Unrecognized flag: --standalone`. The flag only belongs to root
   commands (`opencode api --standalone …`), not to `plugin` subcommands.
2. `opencode api --standalone plugin.list` returned `data: []` and no plugin logs: plugin discovery runs
   when a **project instance boots** (`PluginSupervisor` is part of `Instance` layers), not on bare
   `plugin.list`. Creating a session through the API boots it.
3. `curl` against the manually started server returned **401**. The server prints a generated password, or
   accepts `OPENCODE_PASSWORD`; authenticate with Basic `opencode:<password>`.
4. Prompt payload shape: the endpoint spreads `PromptInput.Prompt.fields`, so the body is
   `{ "text": "…" }` — not `{ "prompt": { "text": "…" } }`. The wrong shape yields
   `InvalidRequestError: Missing key at ["text"]`.
5. `session.switchModel` uses `Model.Ref` = `{ id, providerID }` — I sent `{ modelID }` and got
   `Missing key at ["model"]["id"]`.
6. Accidentally admitted a prompt while no bogus model was set — the session used a default model from the
   shared data dir and produced `[#opencode.error] User not found.` (no tokens spent, and it doubled as a
   real error-path test). Lesson: pin a bogus model **before** prompting in shared-data-dir test servers.
7. A temporary `probe-plugin.ts` was added to verify event shapes and hot reload. OpenCode watched the
   config plugin dir and activated it without a restart — same behavior the real plugin will get.

Verified in the live server:

- `opencode plugin list` → `{"id":"notifyhub","source":{"type":"local",…},"state":{"status":"active"}}`
- `form.created` → pushed `[#opencode.question] OpenCode is asking you a question`
- bogus model prompt → pushed `[#opencode.error] Model unavailable: nope/nope`
- `ctx.session.context()` returned the real `user` message (`"hello from the probe"`), confirming body
  extraction
- event envelope observed: `{ id, created, type, location, data }`

**Lesson**: with `OPENCODE_CONFIG_DIR` + `NOTIFYHUB_PUSH_SCRIPT` + a fake push script, the whole plugin
pipeline can be exercised end-to-end without touching the live config or spending tokens.

## Verification summary

- [x] `npm run typecheck` passes with `strict: true`
- [x] plugin loads in real OpenCode 2.0.18 and reports `status: active`
- [x] all four event handlers verified in a live server (succeeded-body path via context API, failed,
      permission wiring, question/form)
- [x] truncation parity 12/12 against the retired Python implementation
- [x] single-file runtime import works with no `node_modules`
- [x] `make install-plugin` file set updated (verified by inspection; not installed into the live config)

## Lessons learnt

1. **Check the version of a reference checkout before designing against it.** `_refs/opencode` was on the
   v1 branch while the task was v2.
2. **Code beats docs when they disagree.** The v2 docs on the release tag still described the v1 plugin API.
3. **Type-only imports make local plugins portable.** A single `.ts` file with no runtime npm dependency is
   the most robust install artifact for `~/.config/opencode/plugin/`.
4. **Event renames often hide semantic changes.** `session.idle` → `session.execution.succeeded` is a
   different lifecycle signal; `question.asked` became `form.created` because questions became forms.
5. **Test local plugins in an isolated config dir.** `OPENCODE_CONFIG_DIR`, `OPENCODE_PASSWORD`, a fake
   push script, and API-driven `session.create` + `session.form.create` cover most of the pipeline safely.
6. **Differential testing against the code being replaced is cheap and precise** — the truncation port was
   validated before it ever reached a real notification.
7. **`tsc` ignores `tsconfig.json` when files are passed on the command line.** Use the package script.
8. **Instance boot gates plugin loading.** A bare `plugin list` on a cold server shows nothing; create a
   session (or run the agent) to activate the instance.

## Follow-ups / known limitations

- Subagent (child) session completions still notify, matching v1 behavior and v2's built-in notifier. If
  this is too noisy, filter via `ctx.session.get({ sessionID })` → `parentID`.
- `_refs/opencode` still points at the v1 checkout; read v2 with `git show v2.0.18:…` or check out a
  v2.0.x tag.
- `docs/refs/how_opencode_organize_sessions_and_messages.md` describes the v1 SQLite schema and is now
  outdated for v2 (`session_v2` / `session_message`).
- The user's `~/.config/opencode/package.json` still lists `@opencode-ai/plugin@1.14.22`; it is unused by
  the new plugin and can be removed.
- `opencode-trace.py` debugging subcommands (`--list-sessions`, `--list-messages`, `--max-lines`) are gone;
  they remain retrievable from git history if we ever want a standalone v2 trace tool.
