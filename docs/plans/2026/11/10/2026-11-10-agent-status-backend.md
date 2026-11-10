# Agent Status Backend (store + endpoints + config)

**Date**: 2026-11-10
**Status**: Done (deployed hot-patch on nuc `notifyhub-be-1`, verified live)
**Parent**: [`2026-11-10-agent-status-live-broadcast.md`](2026-11-10-agent-status-live-broadcast.md)

Module: `src/notifyhub/backend/` (`models.py`, `backend.py`) + `src/notifyhub/config.py`.

## Goal

A RAM-only, server-owned registry of live agent session states, fed by thin reporters over HTTP
(the herdr `pane.report_agent` model), exposed via REST + SSE, encrypted on the serving side like
notifications.

## What changed

**`models.py`** — `AgentStatusStore` next to `NotificationStore`:

- Keyed by `(agent, session_id)`; entry fields: `state` (running/idle/blocked), `pwd`, `host`,
  `task` (one-line ≤160-char excerpt of the running prompt), `since`, `updated`.
- `update()` broadcasts an SSE `agent_status` event **only on meaningful change** — new entry,
  state/pwd/task change, or a refresh arriving later than the stale window. A silent refresh of
  a fresh running entry re-announces nothing.
- Staleness is **served, never stored**: `serialize_status` reports `state: "stale"` when a
  running entry is older than `stale_after`, but the stored state is untouched, so a late
  refresh revives the entry and re-announces it.
- `entry_transform` hook (same pattern as notifications): the backend passes an
  `encrypt_payload` closure so every served/broadcast entry is a per-item e2e envelope when a
  key is configured. The store itself stays crypto-free.
- Broadcasting is `asyncio.create_task(...)`, wrapped for `RuntimeError` (tests run without a loop).

**`backend.py`**:

- `POST /api/status/{agent}/{state}` — body is *whatever the reporter has*: the raw hook JSON
  curl pipes (claude/codex), explicit fields (opencode plugin), or an e2e envelope. The server
  extracts `session_id` (also accepts camelCase `sessionId`), `pwd`/`cwd`, `host` (falls back to
  the client IP), and the task excerpt (`task_excerpt()`: `task` field or `prompt` from piped
  `UserPromptSubmit` payloads; whitespace-collapsed to one line, tail-truncated with `…`).
  Garbage bodies degrade to a graceful error list like `/api/notify`, never a 500.
- `GET /api/status` — `{agents: [...], server_time}`; entries pass through `entry_transform`.
- `STATUS_AGENTS`/`STATUS_STATES` gate agent/state names.

**`config.py`**: `backend.agent_status_stale_seconds` (default 300). `config.md` updated by hand
(`make config-md` is broken — it calls a `generate_markdown` method that no longer exists).

**Tests**: `tests/notifyhub/backend/test_status.py` — store semantics (silent refresh, stale
revival, task re-announce, transform), API shapes (all three reporter payload shapes, envelope
ingest+serving, host fallback, error cases).

## Trials, errors, lessons

### Stale check measured after the mutation (caught in self-review)

First draft overwrote `existing.updated = now` and *then* computed the age of the previous
report — always zero, so late refreshes never re-announced and stale entries never revived.
**Lesson**: capture-then-mutate; the value you compare against must be the pre-update one.

### Hot-patch crash: new config.py vs September image (see parent doc §2)

`backend.py` now reads the new field via
`getattr(config.backend, "agent_status_stale_seconds", DEFAULT_STATUS_STALE_SECONDS)`.
**Lesson**: files hot-copied into an older container must not *require* anything the image lacks.

### Encrypting entries without putting crypto in the store

First sketch had the store call `encrypt_payload` directly — wrong layer (models stayed clean for
notifications by doing ingest decryption in the backend). The `entry_transform` closure keeps the
boundary and follows key reloads, because it reads the module-global `_e2e_key` at call time.

### Raw-body ingest needed FastAPI surgery-free reading

`claude/codex` curl hooks post with curl's default content type; using a Pydantic body model
would 422 them. `await request.body()` + lenient `json.loads` + `is_envelope` check accepts all
three shapes (raw payload / explicit JSON / envelope) through one path.

## Deployment record (nuc)

```bash
rsync -R src/notifyhub/backend/backend.py src/notifyhub/backend/models.py nuc:~/git/NotifyHub/
ssh nuc 'docker cp ~/git/NotifyHub/src/notifyhub/backend/{backend,models}.py notifyhub-be-1:/app/src/notifyhub/backend/ \
         && docker restart notifyhub-be-1'
```

Container `config.py` is *the image's own September copy* (rolled back after the booleanify
crash); the nuc checkout holds the new one for the next image rebuild.
