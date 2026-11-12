# OpenCode: autoaccept notification race and shared machine labels

**Date**: 2026-11-12
**Status**: Implemented in the working tree; installation into live agent configuration remains an operator step.
**Parent**: [2026-11-12-plugin-labels-installation-and-permissions-plugins.md](2026-11-12-plugin-labels-installation-and-permissions-plugins.md)

## Module and changes

`notifyhub-plugin.ts` keeps `ctx.event.subscribe`, `ctx.session.get`, and `ctx.session.context`.
It already used the public plugin/session APIs; there was no direct database reader to replace.
Completion events do not supply the final notification body, so the context API read remains useful.

- A one-second timer keyed by permission request delays both permission notifications and `blocked`.
- Replies cancel the matching timer while the event loop continues consuming events.
- Before alerting, the plugin checks ownership and `ctx.permission.list` for the exact request.
- An `isCurrent` guard handles cancellation during asynchronous lookups/status preparation.
- Idle/completion and plugin disposal cancel timers. Duplicate asks do not schedule duplicates.
- Replying to one request preserves blocked state when another notified permission remains.
- Live status `host` now honors the same `HOST_MODEL` / `HOSTNAME` / OS precedence as the CLI.

## Investigation, trials, and errors

Installed SDK types were `@opencode/plugin` 2.0.18; the installed OpenCode binary was 2.2.7.
Current documentation contained incompatible API generations, so actual installed types were used
for typechecking. An initial source lookup used the obsolete `packages/opencode/...` path and
returned 404. The versioned GitHub tree located the code under `packages/core` and `packages/tui`.

OpenCode 2.2.7 server permission code publishes a pending request, then the TUI's session view
replies automatically when its local mode is `autoaccept`. NotifyHub's immediate subscription
handler raced that reply. `ctx.permission.hook("evaluate")` runs before this client action and
cannot establish whether a person will see the request. It was considered and not adopted.

See the official versioned sources:
[server permissions](https://github.com/anomalyco/opencode/blob/v2.2.7/packages/core/src/permission.ts),
[TUI autoaccept](https://github.com/anomalyco/opencode/blob/v2.2.7/packages/tui/src/routes/session/index.tsx),
and [permission hooks](https://github.com/anomalyco/opencode/blob/v2.2.7/packages/plugin/src/promise/permission.ts).

## Lessons learnt

An “asked” event can precede an automatic client response. Observe pending lifecycle rather than
reimplementing approval rules. Do not sleep inside the event subscription: that would prevent
consuming the reply that cancels the notification. Recheck identity after awaited work, cancel on
teardown, and test overlapping requests as well as the usual single-request path.

The one-second period is a heuristic, not a server-visible auto-mode flag. A slow/offline client
can leave a real pending request long enough to alert. This is deliberately documented rather than
claiming all autoaccept notifications are impossible.

## Validation and rollout

Eight Bun regression tests passed, covering labels, fast autoaccept, genuine pending requests,
missed replies, cancellation during the API lookup, idle/disposal cleanup, and overlapping requests.
Typechecking passed against installed SDK types. All transports were mocked; no live agent/model
or backend/frontend test was run. Run `make install-plugin` and restart long-lived OpenCode instances.
