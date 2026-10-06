# End-to-End Payload Encryption

Optional AES-256-GCM encryption for notification payloads. When enabled, the
server decrypts once at ingest (so tag matching + Telegram/Bark/macOS push keep
working), then stores and serves **only ciphertext**. Clients that hold the key
decrypt locally.

> **Threat model:** the server holds the key (this is *not* a zero-knowledge
> design). It protects payloads **on the wire** (SSE/REST) and **at rest**
> (in-memory store, disk), but **not** against someone with access to the server
> process/memory. It also does not replace auth — the API still has none.

## Envelope format

`data` is replaced by an opaque envelope on the wire and in storage:

```json
{
  "e2e": 1,
  "alg": "A256GCM",
  "kid": "39163466",
  "iv": "<base64, 12 bytes>",
  "ct": "<base64, ciphertext||16-byte GCM tag>"
}
```

- Plaintext inside `ct` = UTF-8 JSON of the payload dict
  (`message`, `pwd`, `host_model`, extras).
- AAD = the constant `b"notifyhub:v1"` (must match on both sides).
- Fresh random 96-bit IV per encryption; never reused with the same key.
- `kid` = first 8 hex of `sha256(key)` — for diagnostics/rotation, leaks nothing.
- `id` and `timestamp` stay **plaintext** so `before=` pagination, ordering and
  dedupe keep working (this leaks timing/volume, not content).

Implementation: `src/notifyhub/crypto.py` (Python) and
`src/notifyhub/tui/src/utils/crypto.ts` (WebCrypto).

## Key resolution

The key is a 256-bit value, base64 or 64-char hex. For a consolidated setup put
it in `config.jsonl` under `e2e.key` — both the server and the TUI read it there.

| Source | Server | TUI |
|--------|:------:|:---:|
| `e2e.key` in `config.jsonl` / `config.json` | ✅ | ✅ |
| `NOTIFYHUB_E2E_KEY` env | ✅ | ✅ |
| key file (`NOTIFYHUB_E2E_KEY_FILE`, else `~/.config/notifyhub/e2e.key`) | ✅ | ✅ |
| keychain (`notifyhub_e2e_key`) | ✅ | — |

Resolution order per side:

- **Server** (`crypto.load_key`): `e2e.key` (config file / env via confstack) →
  key file → keychain.
- **TUI** (`utils/crypto.ts`): `NOTIFYHUB_E2E_KEY` env → `config.jsonl` `e2e.key`
  → key file.

`config.jsonl` is JSON5 (comments + trailing commas); the TUI parses it with
`Bun.JSON5`. Point at a non-default config with `NOTIFYHUB_CONFIG`.

> **Pitfall:** an **empty** env var still overrides the config (`NOTIFYHUB_E2E_KEY=`
> → empty key). Only set it to a non-empty value when you want to override.

## Commands

```bash
make e2e-status         # print key source + kid (never prints the key)
# → e2e key: config e2e.key (kid 39163466)

make e2e-key            # generate a standalone ~/.config/notifyhub/e2e.key (0600)

# equivalents
python -m notifyhub.crypto --gen-key                 # print a new key
python -m notifyhub.crypto --gen-key --write-default # write the default key file
python -m notifyhub.crypto --key-id "$KEY"           # fingerprint a key
python -m notifyhub.crypto --status                  # key source + kid
```

`make e2e-key` writes a standalone key file (a valid *fallback* source). For a
consolidated setup, put the key under `e2e.key` in `config.jsonl` instead.

Enable it with `"e2e": { "enabled": true }` in `~/.config/notifyhub/config.json`
(or `NOTIFYHUB_E2E_ENABLED=true`). The server logs
`E2E encryption enabled (kid=…)` on startup.

## Server behavior (`backend/backend.py`)

`POST /api/notify` accepts **either** form:

- an **envelope** → decrypted with the key; and
- **plaintext** → used as-is (then encrypted for storage).

Either way the plaintext is used for the existing tag filter + Telegram/Bark/macOS
push, and only the envelope is stored/broadcast. `GET /api/e2e` reports
`{"enabled", "alg", "kid"}`. If `enabled` is true but no key resolves, the server
logs a warning and falls back to plaintext (availability over strictness).

The in-memory `NotificationStore` treats `data` as opaque — it never inspects
`message`/`pwd`.

## TUI behavior (`tui/src/`)

- `utils/crypto.ts` decrypts `init`, live `notification` events, and lazy-loaded
  pages (WebCrypto AES-GCM).
- Items that cannot be decrypted render as a **`LOCKED`** card showing the
  envelope `kid` (diagnoses key mismatches).
- The status popup (`s`) shows server e2e state, whether a local key is set, and
  the locked-row count.
- `make tui` prints `e2e key: <source> (kid …)` before launching.

## Docker

The container mounts `${HOME}/.config/notifyhub` **and `${HOME}/git` read-only**,
so the `config.jsonl` symlink (`→ ~/git/.../notifyhub/config.jsonl`) resolves
inside the container. That means `e2e.enabled` **and** `e2e.key` (now consolidated
there) are read directly — no e2e env vars needed.

```yaml
volumes:
  - ${HOME}/.config/notifyhub:${HOME}/.config/notifyhub
  - ${HOME}/git:${HOME}/git:ro
```

To override from the environment, set `NOTIFYHUB_E2E_KEY` to a **non-empty**
value (an empty one would clobber the config key). Verify with
`docker exec notifyhub-be-1 python -m notifyhub.crypto --status`.

Because the backend is baked into the image, any code/dependency change
(including adding `cryptography`) requires a rebuild — but a volume/env-only
change just needs a recreate:

```bash
docker compose build be && docker compose up -d be   # code/deps changed
docker compose up -d be                              # only volumes/env changed
```

## Tests

- `tests/notifyhub/backend/test_crypto.py` — round-trip, tamper/wrong-key
  rejection, key handling, key-file resolution, `0600` enforcement, `--status`
  source reporting.
- `tests/notifyhub/backend/test_server.py` (`TestE2EEncryption`) — plaintext
  inbound stored as envelope, envelope inbound accepted, wrong-key rejection,
  push sees plaintext, ciphertext page cursor, `/api/e2e`.
- `src/notifyhub/tui/src/__tests__/crypto.test.ts` — decryption, key-file
  resolution, and `config.jsonl` (JSON5) resolution + precedence.

A **fixed cross-language fixture** (key/iv/plaintext → ciphertext, generated by
Python's `AESGCM`) is asserted in *both* the pytest and bun suites, pinning
Python-encrypt ⟷ JS-decrypt compatibility.

## Limitations

- Server holds the key → not zero-knowledge; not a substitute for auth.
- No forward secrecy; rotate by replacing the key (old ciphertext becomes
  undecryptable unless the old key is retained).
- The **web frontend does not decrypt** (out of scope) — with e2e on, read via
  the TUI.
