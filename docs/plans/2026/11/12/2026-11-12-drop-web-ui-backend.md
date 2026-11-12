# Backend: pure JSON API + SSE after web UI removal

**Date**: 2026-11-12
**Parent**: [Drop web UI](2026-11-12-drop-web-ui.md)

## Changes

`src/notifyhub/backend/backend.py`:

- Removed the `/static`, `/icons`, and `/audio` `StaticFiles` mounts and the `frontend_dir`
  path computation.
- Removed `load_and_transform_template()` (dev-`/src/main.tsx` → `/static/app.js` rewriting plus
  stylesheet injection) and the `GET /` HTML route.
- Removed the now-unused `HTMLResponse`, `StaticFiles`, and `textwrap` imports. `os` stays: the
  Bark icon code still calls `os.path.basename`.
- Remaining surface: `POST /api/notify`, `POST /api/status/{agent}/{state}`, `GET /api/status`,
  `GET /api/e2e`, `GET /api/notifications` (+`/count`), `DELETE /api/notifications`,
  `GET /events` (SSE), CORS middleware, and the shutdown-broadcast lifespan — unchanged in
  behavior.

Tests:

- `TestRootEndpoint` (root HTML/React-app assertions) removed from
  `tests/notifyhub/backend/test_server.py`.
- `tests/notifyhub/backend/test_template.py` deleted (it tested the removed template transform).

README: anchor `#11-backend-configuration` → `#6-backend-configuration` (parent README was
renumbered), plus this session-record section.

## Trials, errors, and lessons learnt

1. **Static mounts were import-time side effects.** `StaticFiles(directory=...)` validates the
   directory when the module is imported, so importing `notifyhub.backend.backend` in an
   environment without a built `frontend/static/` tree would crash. Their removal decoupled the
   app import from the build artifact — an accidental robustness win worth recording.
2. **Import pruning by grep, not by eyeball.** `textwrap` and the two FastAPI response/static
   imports were obvious, but `os` looked removable and was not (Bark icon basename). Confirmed
   with `grep "os\."` before finalizing; the import check + route inventory then passed clean.
3. **Test deletions follow the code, config tests follow the environment.** Deleting
   `TestRootEndpoint` and `test_template.py` was mechanical; the three `test_config.py` failures
   that showed up in the full run were a different animal (environment leak via confstackify —
   see the parent record) and were proven pre-existing against a pristine `HEAD` worktree rather
   than "fixed" blindly.

## Validation

- `python -m pytest tests/notifyhub/backend tests/notifyhub/cli tests/notifyhub/plugins -q`:
  **177 passed**.
- `python -c "from notifyhub.backend import backend; ..."` boots (keychain warnings are the
  operator's live config, not errors) and lists no `/`, `/static`, `/icons`, `/audio` routes.
