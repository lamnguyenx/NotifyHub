# Tailscale Funnel & Remote Push

> How NotifyHub is published to the public internet over a **Tailscale funnel**,
> and how clients push to that HTTPS URL.

## TL;DR

```bash
# publish the local backend (9080) at https://nuc.tail0ec64c.ts.net
tailscale funnel --bg --yes 9080

# push from anywhere (CLI)
NOTIFYHUB_CLI_SCHEME=https NOTIFYHUB_CLI_HOST=nuc.tail0ec64c.ts.net \
  NOTIFYHUB_CLI_PORT=443 python -m notifyhub.cli.cli "hello"

# …or with the dependency-free script
./local/push-funnel-noti.sh "hello"
```

## Funnel port rules (read this first)

Tailscale Funnel is **TLS-terminated** and only ever listens on **443, 8443, and
10000**. It forwards to a *local* port:

```
https://nuc.tail0ec64c.ts.net  ──►  http://127.0.0.1:9080
   (funnel, 443)                       (the backend)
```

So:

- The **public URL never carries the backend port** — `nuc.tail0ec64c.ts.net:9080`
  is not a funnel address.
- Clients must speak **https** to port **443** (or 8443/10000), not http to 9080.

Useful commands:

```bash
tailscale status            # tailnet peers, own IP
tailscale funnel status     # current handler (should proxy 127.0.0.1:9080)
tailscale funnel --bg --yes 9080   # (re)point the funnel at 9080
tailscale funnel --https=443 off   # take it down
tailscale funnel reset             # clear all serve/funnel config
```

## Client configuration

The address is built by `NotifyHubCliConfig.address` as
`{scheme}://{host}[:port]`, where the scheme's default port (80/443) is omitted.

| Setting | Default | Notes |
|---|---|---|
| `NOTIFYHUB_CLI_SCHEME` | `http` | Set to `https` for the funnel. `https://` is normalized; blank → `http` |
| `NOTIFYHUB_CLI_HOST` | `0.0.0.0` | Use `nuc.tail0ec64c.ts.net` for the funnel |
| `NOTIFYHUB_CLI_PORT` | `9080` | Use `443` for the funnel |

Both the **CLI** (`--scheme` / `--host` / `--port` flags too) and the **OpenCode
plugin** honor these; the plugin forwards `NOTIFYHUB_CLI_SCHEME` to the spawned
push script.

```bash
# CLI flags
python -m notifyhub.cli.cli --scheme https --host nuc.tail0ec64c.ts.net --port 443 'hi'

# env (also used by the plugin)
NOTIFYHUB_CLI_SCHEME=https NOTIFYHUB_CLI_HOST=nuc.tail0ec64c.ts.net \
  NOTIFYHUB_CLI_PORT=443 python -m notifyhub.cli.cli 'hi'
```

The `~/.bashrc` helper `noti-funnel` wraps exactly this (the tailnet-only helpers
`noti`/`noti2` keep using `:9080`).

## One-file drop (no Python, no repo)

`local/push-funnel-noti.sh` needs only `bash` + `curl`:

```bash
./push-funnel-noti.sh "build finished"                 # arg
echo "deploy done" | ./push-funnel-noti.sh             # stdin
NOTIFYHUB_URL=https://other.example.com ./push-funnel-noti.sh "hello"
NOTIFYHUB_PWD=/srv/app ./push-funnel-noti.sh "deploy done"
```

It JSON-escapes the payload in pure bash and exits non-zero if the backend
returns `{"error": …}`.

Raw equivalent, if even the script is too much:

```bash
curl -fsS -X POST https://nuc.tail0ec64c.ts.net/api/notify \
  -H 'Content-Type: application/json' \
  -d '{"data":{"message":"hello","pwd":"'"$PWD"'"}}'
```

## ⚠️ Security

The exposed API has **no authentication** and CORS `*`. Anyone who has the URL can:

- push notifications (`POST /api/notify`) — spam, and trigger Bark/macOS pushes;
- read/enumerate (`GET /api/notifications`, `/events`, `/notifications/count`);
- delete everything (`DELETE /api/notifications`).

**e2e encryption is not auth** — it hides payload *contents*, but ingest accepts
plaintext and read/delete stay open. To lock it down, add a shared-secret Bearer
token to `POST /api/notify` (and ideally the read/delete routes) and have clients
send `Authorization: Bearer …`. Until then, treat the URL as a write credential.

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| Public URL returns **502** | Funnel proxies a **dead** local port | `tailscale funnel status` vs `ss -tlnp`: repoint with `tailscale funnel --bg --yes 9080` |
| `✗ Network error` connecting to `…:443` | Scheme is `http` but the port is a TLS listener | set `NOTIFYHUB_CLI_SCHEME=https` |
| `:9080` refused / TLS "wrong version number" | Funnel doesn't serve 9080; hit port 443 instead | use `https://host` (no port) |
| Reachable on the tailnet but not publicly | Funnel off, or ACL denies funnel | `tailscale funnel status`; check tailnet ACLs allow funnel |

## Implementation map

| Concern | Where |
|---|---|
| `scheme` field, `address` construction | `src/notifyhub/config.py` (`NotifyHubCliConfig`) |
| `--scheme` flag, env plumbing | `src/notifyhub/cli/cli.py` |
| Plugin env forward | `src/notifyhub/plugins/opencode/notifyhub-plugin.ts` |
| Standalone pusher | `local/push-funnel-noti.sh` |
| Tests | `tests/notifyhub/test_config.py` (`TestCliSchemeAndAddress`), `tests/notifyhub/cli/test_cli.py` |

The full story (trials, errors, lessons): `docs/plans/2026/10/07/2026-10-07-notifyhub-funnel-https-push.md`.
