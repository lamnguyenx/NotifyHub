# End-to-End Payload Encryption (backend + TUI)

**Date**: 2026-10-06
**Status**: Done

## Goal

Add optional **AES-256-GCM** encryption for notification payloads so that
notification contents (`message`, `pwd`, `host_model`) are protected on the wire
and at rest, without breaking the existing server-side push integrations
(Telegram / Bark / macOS toast) or the tag filter that drives them.

Reference: `docs/important/e2e-encryption.md`.

## Context (how we got here)

The task started as a quick observation — "is this machine funneling 9080 via
Tailscale?" — which turned into a security review:

- The funnel pointed at `127.0.0.1:9682` (dead), **not** 9080.
- 9080 is a Docker `0.0.0.0` port mapping → the FastAPI backend, reachable over
  the tailnet (and funnel/tailnet in general).
- The backend had **no auth**, CORS `*`, and stored notifications **in plaintext**
  in memory. `msg`/`pwd` carry AI conversation excerpts and absolute paths.

So the goal became: encrypt payloads at the app layer.

## Decisions (locked with the user)

| Question | Decision |
|---|---|
| Threat model | **Not** zero-knowledge. The server holds the key, decrypts at ingest. |
| Scheme | Shared **PSK**, **AES-256-GCM** (authenticated), versioned envelope. |
| Push integrations | **Stay server-side** (server decrypts to push). |
| Direction | Client → server **and** server → client (web/TUI) both encrypted. |
| Fields | **Everything** except `id`/`timestamp`. |
| Scope | **`backend/` + TUI only** — web frontend explicitly out of scope. |
| Python crypto | `cryptography` library (`AESGCM`). |

The pivotal realization: **a zero-knowledge server cannot push** (it can't read
the message). Since the user wanted to keep Telegram/Bark/macOS push, the design
had to let the server decrypt — accepting "wire + disk protection, not server
memory protection".

## Final state

### Envelope (replaces `data` on the wire and in storage)

```json
{ "e2e": 1, "alg": "A256GCM", "kid": "39163466",
  "iv": "<b64, 12 bytes>", "ct": "<b64, ciphertext||16-byte tag>" }
```

- Plaintext = UTF-8 JSON of the payload dict; AAD = `b"notifyhub:v1"`.
- Fresh random 96-bit IV per message; `kid` = `sha256(key)[:8]` hex.
- `id` / `timestamp` stay plaintext (cursor pagination + dedupe).

### Files

| File | Change |
|---|---|
| `src/notifyhub/crypto.py` **(new)** | Envelope encrypt/decrypt, key normalize/`kid`, file/env/keychain resolution, `--gen-key` / `--key-id` / `--status` CLI |
| `src/notifyhub/backend/backend.py` | Ingest decrypt-or-plaintext → push (plaintext) → re-encrypt → store; `GET /api/e2e` |
| `src/notifyhub/backend/models.py` | `Notification` is now `{id, timestamp, data}` (opaque); shared `serialize_notification` |
| `src/notifyhub/config.py` | `NotifyHubE2EConfig { enabled, key }` |
| `src/notifyhub/example_config.json` | `"e2e": { "enabled": false, "key": "" }` |
| `requirements.txt` / `pyproject.toml` | `cryptography` |
| `src/notifyhub/tui/src/utils/crypto.ts` **(new)** | WebCrypto decrypt + key resolution (env → config.jsonl → key file) |
| TUI `types.ts`, `utils/api.ts`, `hooks/useNotifications.ts`, `components/NotificationRow.tsx`, `components/StatusPopup.tsx`, `App.tsx` | `locked` state, `GET /api/e2e`, LOCKED rows, e2e status line, decrypt on init/live/load-more |
| `Makefile` | `e2e-key` / `e2e-status`; `make tui` prints key source; **fixed stale `test-backend` path** |
| `docker-compose.yml` | read-only `~/git` mount (resolves the `config.jsonl` symlink); removed clobbering e2e env |
| `docs/important/e2e-encryption.md` **(new)**

### Key resolution

- **Server** (`crypto.load_key`): `e2e.key` (config file / env via confstack) →
  key file → keychain `notifyhub_e2e_key`.
- **TUI** (`utils/crypto.ts`): `NOTIFYHUB_E2E_KEY` env → `config.jsonl` `e2e.key`
  (JSON5 via `Bun.JSON5`) → key file.
- **Consolidated setting** in `~/.config/notifyhub/config.jsonl`:
  `"e2e": { "enabled": true, "key": "…" }` — read by both server and TUI.

## Implementation history (trials and errors)

### Step 1: The zero-knowledge / push conflict

First plan was a true zero-knowledge server (server can't read). Writing the plan
exposed the contradiction: Telegram/Bark/macOS push and the tag filter all read
`message`/`pwd` at the server, so a zero-knowledge server silently loses those
features.

**Resolution**: presented the trade-off; the user chose the **server-participant**
model (server holds the key, decrypts at ingest, pushes, stores ciphertext).
Lesson: surface the architectural conflict *before* writing code, not after.

### Step 2: Web frontend is out of scope → accept plaintext inbound

The user scoped the work to `backend/` + TUI. To make that coherent, the server
accepts **both** plaintext (encrypts it server-side) and pre-encrypted envelopes.
No CLI change needed; the producer→server hop stays plaintext (inside the tailnet).

### Step 3: Store had to stop understanding `message`

`NotificationStore` previously held `Notification` objects with `message`/`pwd`
and serialized them directly, and the backend used `data.message`/`data.pwd` for
push. Refactor: `Notification` became a generic record `{id, timestamp, data}`
where `data` is opaque; push code now works off the **decrypted dict** at ingest,
before sealing. `serialize_notification` moved into `models.py` and is reused by
both REST and the SSE broadcast.

### Step 4: Sloppy editing broke the file (real error)

During the `_serialize_notification` → `serialize_notification` swap, an edit
accidentally swallowed the `@app.get("/api/notifications/count")` decorator and
a later edit **duplicated** the `_serialize_notification` function. Caught by
re-reading the region and cleaning up deterministically.

**Lesson**: after a multi-step edit on one file, re-read the whole function
region; small `oldString` slices can drop adjacent lines.

### Step 5: Test expectations were wrong (my tests, not the code)

- `len(ct) > len(json) + 16` should have been `>=` (ciphertext = plaintext + tag).
- The `before=` cursor test asserted the wrong id — with newest-first ordering,
  `before=ids[1]` (middle) returns the *oldest*, `ids[0]`, not `ids[2]`.

**Lesson**: verify the assertion's arithmetic/ordering against the data model
before assuming the implementation is wrong.

### Step 6: TypeScript 5.9 `Uint8Array` generics

`crypto.subtle.importKey` / `decrypt` rejected `Uint8Array<ArrayBufferLike>` as
`BufferSource` (`ArrayBufferView<ArrayBuffer>`). Fixed by typing the arrays as
`Uint8Array<ArrayBuffer>` (and building them with `new ArrayBuffer(n)`).

### Step 7: Bun JSON5 — the TUI can read `config.jsonl`

`config.jsonl` is JSON5 (has `//` comments), so `JSON.parse` fails. Checked
`Bun.JSON5` on Bun 1.4.0 → `Bun.JSON5.parse` exists, so the TUI reads the
consolidated config directly (with a comment-stripping fallback).

### Step 8: Pre-existing test failures (not ours)

Baseline `pytest` had 4 failures: 3 in `test_config.py` caused by the **live**
`~/.config/notifyhub/config.jsonl` leaking into the tests (they assert defaults),
and 1 `test_initialization` asserting `max_notifications == 1000` while the code
default is `None`. Left the config ones (environmental); fixed the model-default
assertion alongside the shape change. Also discovered `make test-backend` pointed
at a non-existent `src/notifyhub/backend/__tests__/` — fixed to `tests/notifyhub`.

### Step 9: Docker — stale image, broken symlink, empty-env clobber

Three separate Docker issues:

1. **Stale image**: the running container predated the code (`ModuleNotFoundError:
   notifyhub.crypto`, `/api/e2e` → 404). Rebuild required (`docker compose build be`).
2. **Broken config symlink**: `~/.config/notifyhub/config.jsonl` →
   `~/git/xdgg-private/notifyhub/config.jsonl`, which wasn't mounted → the
   container read **no** config (Bark silently disabled). Fixed by mounting
   `${HOME}/git:${HOME}/git:ro`.
3. **Empty env clobber**: `NOTIFYHUB_E2E_KEY=${NOTIFYHUB_E2E_KEY:-}` passes an
   **empty** string, and confstack's env layer **overrides** the config value →
   server got an empty key → `enabled:false` (silent plaintext fallback). Fixed
   by removing the env lines (config is the source) and documented the pitfall.

### Step 10: Consolidation

The user first asked to move the key into `~/.config/notifyhub/e2e.key` (so the
TUI could read it), then asked to consolidate into `config.jsonl`. Final state:
key lives in `config.jsonl`; the standalone `e2e.key` was removed; the TUI reads
`config.jsonl` via `Bun.JSON5`. `make e2e-status` was made config-aware and now
reports `config e2e.key (kid …)`.

## Verification summary

- [x] Python tests: `python -m pytest tests/notifyhub/backend tests/notifyhub/cli -q` → **66 passed**
- [x] TUI tests: `bun test` → **129 passed** (8 files)
- [x] Cross-language fixture (Python `AESGCM` encrypt → JS WebCrypto decrypt)
      asserted in **both** suites
- [x] Live: `GET /api/e2e` → `{"enabled":true,"alg":"A256GCM","kid":"39163466"}`
- [x] `make e2e-status` (host) and `docker exec … crypto --status` → `config e2e.key`
- [x] End-to-end: POST plaintext → stored/served as envelope → TUI decrypts with
      **no env var** (key from `config.jsonl`)
- [x] `make -n e2e-key` / `make -n tui` expand correctly

## Lessons learnt

1. **Resolve architecture conflicts before coding.** "Zero-knowledge" vs
   "server-side push" is a hard trade-off; catching it in planning saved a large
   rewrite.
2. **A zero-knowledge server cannot push.** Push must run where plaintext exists
   (producer or a key-holding server). There is no free lunch.
3. **Reuse the existing secret-resolution pattern.** `bark.py`/`telegram.py`
   already did `security` / `secret-tool`; following it made key handling boring.
4. **Publish a cross-language fixture.** One Python-generated vector asserted in
   both pytest and bun pins the Python⟷JS contract and catches AAD/format drift.
5. **Empty env vars are not "unset".** `FOO=${FOO:-}` overrides config with `""`.
   Never forward optional secrets as empty defaults in compose.
6. **A symlink in a mounted dir is not a mounted file.** If a config is a symlink
   out of the mounted tree, the container can't read it — mount the target (ro).
7. **Re-read after multi-step edits.** Small `oldString` slices can drop decorators
   and duplicate functions.
8. **Docker images are snapshots.** Code/deps changes need `build`; only
   volume/env changes need `up -d`.
9. **Test isolation matters around live config.** Tests that call `confstackify`
   pick up the developer's real `~/.config`; assert against explicit inputs.
10. **Check the runtime, not the assumption.** `Bun.JSON5.parse` existing turned a
    "needs a new dependency" problem into a one-liner.

## Follow-ups / known limitations

- **Server holds the key** → not zero-knowledge; protects wire + disk, not server
  memory. Not a substitute for auth (API still has none; CORS `*`).
- **Web frontend does not decrypt** (out of scope) — with e2e on, read via the TUI.
  `GET /api/notifications` returns envelopes the web app can't parse.
- **No forward secrecy**; rotate by replacing the key (old ciphertext becomes
  unreadable unless the old key is retained).
- **Metadata leaks**: `id` (time-based), `timestamp`, and count remain plaintext.
- **Remote TUI** without local `config.jsonl` must fall back to
  `NOTIFYHUB_E2E_KEY` or a key file.
- Consider auth (Bearer token) as the real fix for the exposed 9080/tailnet issue
  that started this work.
