# TUI connection: honor `NOTIFYHUB_CLI_SCHEME`

**Date**: 2026-11-10
**Status**: Done (verified against the nuc HTTPS funnel)
**Parent**: [`2026-11-10-tui-startup-transport-layout.md`](2026-11-10-tui-startup-transport-layout.md)

Module: `src/notifyhub/tui/src/utils/api.ts` (+ `utils.test.ts`).

## Problem

`make tui` could not reach the backend published behind the Tailscale funnel:

```bash
export NOTIFYHUB_CLI_SCHEME="https"
export NOTIFYHUB_CLI_HOST="nuc.tail0ec64c.ts.net"
export NOTIFYHUB_CLI_PORT="443"
```

`curl https://nuc.tail0ec64c.ts.net/api/notifications/count` returned `200`, but the TUI showed
nothing. `getApiBase()` was hardcoded:

```ts
return `http://${_host}:${_port}`
```

So the TUI dialed `http://nuc.tail0ec64c.ts.net:443` — plain HTTP at a TLS port. The CLI and the
OpenCode plugin had learned `NOTIFYHUB_CLI_SCHEME` in `23ab298`; the TUI was missed.

## Fix

`utils/api.ts` now mirrors the CLI's address handling:

- `normalizeScheme()` accepts `http`, `https`, `HTTPS`, `https://`, a trailing `:`, and treats an
  exported-empty value as `http` (same normalization as `config.py::_normalize_scheme`).
- `buildApiBase(scheme, host, port)` omits the scheme's default port (`80` for http, `443` for
  https), matching `NotifyHubCliConfig.address` and the plugin.
- `DEFAULT_HOST` trims and treats an empty `NOTIFYHUB_CLI_HOST` as `localhost`, so the
  CLI's empty-host **mute** convention does not produce `http://:9080`.
- `buildApiBase` is exported and covered by four unit tests (non-default port, 443 omitted,
  80 omitted, non-default https port).

`NOTIFYHUB_CLI_PROXY` remains CLI-only: `cli.py` applies it to its `requests.Session`, while the
TUI uses `fetch`. An empty value (as in the user's shell) changes nothing.

## Trials, errors and lessons

### `curl` success ≠ client configured correctly

The first instinct was "the funnel/tailnet is flaky". `curl` to the same URL succeeded, which
narrowed the problem to the client. Always compare the exact URL the app builds with the URL
that works.

### The scheme was documented but not implemented

The README's TUI env table already listed `NOTIFYHUB_CLI_SCHEME`, so the gap was invisible on
paper. The env var existed on the server/CLI side. Lesson: when adding a transport option,
grep every client of `NOTIFYHUB_CLI_*` — `cli.py`, the OpenCode plugin, the TUI, and the hook
scripts each construct URLs independently.

### Silent reconnect loops hide connection errors

`connectSSE()` catches every failure and just flips `streaming` off before retrying. A wrong
scheme therefore looks exactly like an empty feed. Candidate follow-up: show the resolved
`getApiBase()` in the status popup (`s`), or log it on startup.

## Verification

```text
base: https://nuc.tail0ec64c.ts.net
count: 26
```

`make tui-test`: all pass, including the new `buildApiBase` cases. Live `GET /events?limit=30`
also returned `init` + `heartbeat` over TLS.
