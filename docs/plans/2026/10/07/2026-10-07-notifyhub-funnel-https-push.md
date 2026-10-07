# Expose NotifyHub over a Tailscale Funnel (HTTPS push from the internet)

**Date**: 2026-10-07
**Status**: Done

## Goal

Let people **outside the tailnet** push notifications to the NotifyHub backend by
publishing it through a Tailscale funnel — and make the first-party clients (the
CLI, which the OpenCode plugin spawns) able to speak **HTTPS** so they can target
that public URL. The backend itself is not changed.

Reference: `docs/important/funnel-remote-push.md`.

## Context (how we got here)

The task started as a three-line request — "check this machine / funnel
`nuc.tail0ec64c.ts.net:9080` / allow others from the internet to push noti" —
and immediately surfaced two mismatches *before* any change:

1. **`:9080` is not a funnel port.** Tailscale Funnel serves only **443 / 8443 /
   10000**. It TLS-terminates and forwards to a *local* port, so the public URL
   is `https://nuc.tail0ec64c.ts.net` (443) — not `…:9080`.
2. **The funnel pointed at a dead port.** `tailscale funnel status` showed
   `https+insecure://127.0.0.1:9682`, and both `ss -tlnp` and `curl` confirmed
   **nothing was listening on 9682** — the public URL returned **HTTP 502**.
   NotifyHub was actually running on `0.0.0.0:9080` in Docker (`notifyhub-be-1`,
   image `lamnguyenx/notifyhub:2026.09.23rev02`).

The user's shell (`~/.bashrc` L193–195) exported
`NOTIFYHUB_CLI_HOST="nuc.tail0ec64c.ts.net"`, `NOTIFYHUB_CLI_PORT="9080"`,
`NOTIFYHUB_CLI_PROXY=""` — the **tailnet-direct** path — which is where the
"funnel at :9080" mental model came from.

A security review of the exposure found no auth anywhere (`POST /api/notify`,
`GET /api/notifications`, `GET /events`, `DELETE /api/notifications` were all
open, CORS `*`). e2e payload encryption was enabled but is **not** auth. This was
presented; the user explicitly chose to expose it **without auth**.

## Decisions (locked with the user)

| Question | Decision |
|---|---|
| Exposure | **Repoint the funnel to 9080**, no auth (user's explicit choice) |
| Client support | Add an `https` **scheme** option to the CLI/config, forwarded by the plugin |
| Scope | `config.py` + `cli.py` + plugin + docs; **no backend change**, so **no rebuild** |
| Remote drop | A dependency-free `bash`+`curl` one-file script for people without Python/checkout |
| TUI | Out of scope (read-side; it has its own `api.ts` URL builder) |

## Final state

### Funnel

```bash
tailscale funnel --bg --yes 9080
# https://nuc.tail0ec64c.ts.net/  →  http://127.0.0.1:9080   (port 443, funnel on)

# revert:
tailscale funnel --https=443 off     # or: tailscale funnel reset
```

### Config: `cli.scheme`

`NotifyHubCliConfig` gained `scheme: str = "http"`:

- Normalized + validated in two `field_validator`s: lowercased, `"https://"`
  accepted, trailing `:/` stripped, blank → `http`; anything not `http`/`https`
  raises `ValidationError`.
- `address` (computed) = `{scheme}://{host}[:port]`, **omitting the scheme's
  default port** (80 / 443) so a funnel target reads as a clean URL
  (`https://nuc.tail0ec64c.ts.net`), while non-default ports are kept.

### Clients

- **CLI** (`cli.py`): `--scheme` flag added to `CliArgs`, and `scheme` added to
  `CLI_FIELDS`/`CLI_DEFAULTS` so `NOTIFYHUB_CLI_SCHEME` flows through confstack.
- **Plugin** (`notifyhub-plugin.ts`): forwards `NOTIFYHUB_CLI_SCHEME` (default
  `http`) to the spawned push script, next to host/port.

### Remote one-file drop

`local/push-funnel-noti.sh` — `bash` + `curl` only:

- message from args **or** stdin; JSON-escapes `message`/`pwd` in pure bash;
- `NOTIFYHUB_URL` (default `https://nuc.tail0ec64c.ts.net`) and `NOTIFYHUB_PWD`
  overrides; turns a backend `{"error": …}` into exit 1.

### Local shell

`~/.bashrc`: added a `noti-funnel` function (scheme `https`, port `443`)
alongside the existing tailnet `noti`/`noti2` (which stay on `:9080`). The
installed plugin and push script are **symlinks into this repo**
(`~/.config/opencode/plugin/notifyhub-plugin.ts → …/src/…`,
`notifyhub-push.py → …/src/notifyhub/cli/cli.py`), so the code change was live
with no reinstall.

### Files

| File | Change |
|---|---|
| `src/notifyhub/config.py` | `cli.scheme` field + validators; `address` builds `{scheme}://…` and omits default ports |
| `src/notifyhub/cli/cli.py` | `--scheme` flag; `scheme` in `CLI_FIELDS`/`CLI_DEFAULTS` |
| `src/notifyhub/plugins/opencode/notifyhub-plugin.ts` | forward `NOTIFYHUB_CLI_SCHEME` to the push script |
| `src/notifyhub/example_config.json` | `"scheme": "http"` |
| `src/notifyhub/config.md` | `cli.scheme` row (hand-added; generator is stale — see Step 6) |
| `local/push-funnel-noti.sh` **(new)** | standalone bash+curl pusher |
| `tests/notifyhub/test_config.py` | `TestCliSchemeAndAddress` (8 cases) |
| `tests/notifyhub/cli/test_cli.py` | https flags + https-from-env dry-run (2 cases) |
| `README.md` | CLI §15 https/funnel examples, remote script, env table row, plugin env list |
| `~/.bashrc` (outside repo) | `noti-funnel` helper |

### Usage (as shipped)

```bash
# CLI over the funnel
python -m notifyhub.cli.cli --scheme https --host nuc.tail0ec64c.ts.net --port 443 'hello'
NOTIFYHUB_CLI_SCHEME=https NOTIFYHUB_CLI_HOST=nuc.tail0ec64c.ts.net \
  NOTIFYHUB_CLI_PORT=443 python -m notifyhub.cli.cli 'hello'

# Remote drop
./local/push-funnel-noti.sh "build finished"     # or: echo hi | ./local/push-funnel-noti.sh
```

## Verification summary

- [x] Funnel: `tailscale funnel status` → 443 → `http://127.0.0.1:9080` (was 502 on the dead `:9682`).
- [x] Public: `GET /api/e2e`, `GET /api/notifications/count`, `POST /api/notify` all served over `https://nuc.tail0ec64c.ts.net`.
- [x] CLI over HTTPS: `NOTIFYHUB_CLI_SCHEME=https … :443` → rc 0, notification id returned.
- [x] `noti-funnel` (bashrc fn) and `local/push-funnel-noti.sh` → both rc 0, delivered.
- [x] `pytest tests/notifyhub` → **145 passed, 3 failed** (pre-existing — see Step 7).
- [x] `pytest tests/notifyhub/backend tests/notifyhub/cli` → **93 passed**.
- [x] Plugin `npm run typecheck` → clean.
- [x] Live test notifications cleaned up via snapshot-diff (see Step 8).

## Implementation history (trials and errors)

### Step 1: The `:9080` port fallacy

The request said "funnel `nuc.tail0ec64c.ts.net:9080`". A funnel cannot publish an
arbitrary port — it binds **443/8443/10000** only and forwards to a local port.
Resolution: the public URL is port 443; `9080` is only the *backend* port the
funnel proxies to. Lesson learned *before* touching anything by reading
`tailscale funnel --help` and `status` first.

### Step 2: The funnel was already on, but dead (HTTP 502)

`tailscale funnel status` showed the handler proxying to
`https+insecure://127.0.0.1:9682`. `ss -tlnp | grep 9682` → **nothing**, and the
public URL returned **502**. So the funnel had been misconfigured/stale for a
while. Fixed by replacing the handler:

```bash
tailscale funnel --bg --yes 9080
```

(`--yes` skips the interactive confirmation; `--bg` detaches.)

### Step 3: Security review — no auth, and e2e is not auth

Funnel = public. The backend had (and still has) **no auth** and CORS `*`:
`POST /api/notify` (spam), `GET /api/notifications` + `/events` + `/count`
(read/enumerate), `DELETE /api/notifications` (wipe). Ingest also fires
**Bark/macOS** push, so a stranger could ping the user's phone. e2e encryption
hides payload *contents* but the ingest accepts plaintext and read/delete stay
open — so it is **not** a substitute for auth (the same conclusion the 10/06 plan
recorded). This was presented; the user chose to proceed unauthenticated.

### Step 4: The CLI hardcoded `http://`

With the funnel live, the CLI still could not reach it:
`NotifyHubCliConfig.address` was literally `f"http://{self.host}:{self.port}"`.
Reproduced deterministically:

```
NOTIFYHUB_CLI_HOST=nuc.tail0ec64c.ts.net NOTIFYHUB_CLI_PORT=443 \
  python -m notifyhub.cli.cli "x"
→ ✗ Network error: Failed to connect to http://nuc.tail0ec64c.ts.net:443
```

`http://…:443` hits a TLS listener and fails. Fix: the `scheme` field (above).
The `--port 443` case is fine because `requests` speaks HTTPS once the scheme is
`https`.

### Step 5: Plugin typecheck failed — missing `@types/node` (TS2688)

`npm run typecheck` failed with `error TS2688: Cannot find type definition file
for 'node'`. The plugin's `node_modules` was a **partial** install (TypeScript
present, `@types/node` absent). Fix: `npm install` in
`src/notifyhub/plugins/opencode/` then re-run — clean. Not caused by the change.

### Step 6: The config-markdown generator is stale

`make config-md` runs `NotifyHubConfig.generate_markdown()`, but confstack now
exposes `generate_config_markdown(model_cls, app_name)` — the method no longer
exists (`hasattr(...) == False`). It also needs `htpy`, which is not installed.
Rather than fix the tooling mid-task, `cli.scheme` was added to
`src/notifyhub/config.md` **by hand** to keep the generated table in sync.

### Step 7: Pre-existing test failures (live-config leak)

`pytest tests/notifyhub` shows 3 failures in `test_config.py`
(`test_overrides_none_values_dont_override_defaults`,
`test_env_vars_override_defaults`, `test_overrides_override_env_vars`) — they
assert `notifications_max_count is None` but the live
`~/.config/notifyhub/config.jsonl` leaks `1000` in. Verified **pre-existing** by
`git stash` + re-run (same 3 failures). Left alone; they are environmental, not
caused by this work.

### Step 8: Cleaning up against a live store (race)

The backend store is live: verification pushes create real notifications, and the
count drifted on its own (8 → 34 over the session, from other traffic). Deleting
"the newest" would risk nuking a real notification. Instead each test snapshotted
the id list **before**, pushed, snapshotted **after**, and deleted only the ids in
the set difference — precise and idempotent.

## Lessons learnt

1. **Funnel ≠ arbitrary port.** It binds 443/8443/10000 and forwards to a local
   port; the public URL never carries the backend port. Read `funnel status`/`--help`
   before assuming.
2. **Check the machine before changing it.** The request assumed the funnel was on
   9080; it was actually on a **dead** 9682 (502). The stale target was only found
   by querying the live config.
3. **TLS lives in the scheme, not the port.** `http://host:443` fails; the right
   fix is an explicit, validated `scheme` — and omitting default ports makes the
   address readable.
4. **e2e encryption is not auth.** It protects payload contents; it does not stop
   spam, reads, or wipes. Exposing a write API publicly needs auth, which was
   consciously deferred.
5. **Symlinked installs make repo edits live immediately.** The OpenCode plugin
   and push script are symlinks into the repo, so no reinstall step was needed —
   worth knowing for verification.
6. **Config-generation tooling rots.** `make config-md` was already broken
   (renamed API + missing `htpy`); hand-sync the generated file until fixed.
7. **Isolate tests from live env/config.** `run_cli` already strips `NOTIFYHUB*`
   env; the config tests still leak the developer's real `config.jsonl`.
8. **Clean up live-state tests with snapshot diffs,** not "delete newest" — the
   store has concurrent traffic.
9. **`npm install` for the plugin is not optional** — typecheck fails on a
   partial `node_modules`.

## Follow-ups / known limitations

- **No auth** (world-writable): anyone with the URL can push/read/wipe and trigger
  Bark/macOS pushes. A shared-secret Bearer token is the real fix.
- **TUI ignored**: `tui/src/utils/api.ts` still builds `http://` URLs; the TUI is
  read-side and was out of scope.
- **Remote users need the new CLI** (or the script): the updated `cli.py`/plugin
  must be copied to their machines; the funnel URL alone is not enough for the old
  client.
- **Funnel lifetime**: `tailscale funnel` state persists in tailscaled, but a
  `tailscale funnel reset`/ACL change will silently take the URL down.
- **`make config-md` is still broken** (confstack rename + `htpy`) — fix separately.
