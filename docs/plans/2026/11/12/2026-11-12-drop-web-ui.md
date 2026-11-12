# Web UI removal: NotifyHub becomes an API + TUI

**Date**: 2026-11-12
**Status**: Implemented in the working tree; deliberately left uncommitted for operator review.

## Scope and module records

The user asked to drop the web UI. The removal touched the repository shell and the backend
module directly, decommissioned the frontend module, and required a link repair in the CLI
module's README. The TUI and the three plugin integrations needed no module changes.

| Module | Session record |
|---|---|
| Repository / Makefile / Docker / packaging / docs | This document |
| Backend | [Backend](2026-11-12-drop-web-ui-backend.md) |
| Web frontend (decommissioned) | [Frontend](2026-11-12-drop-web-ui-frontend.md) |
| CLI (README anchor fix only) | [CLI](2026-11-12-drop-web-ui-cli.md) |
| TUI | No module change — already self-contained (own audio assets, own e2e decrypt); only parent-level guides referencing it were updated |
| Plugins (opencode, claude, codex) | Not touched |

## Result

- The React web UI, its Playwright CDP E2E suite, and the Vite/bun build chain are deleted
  (`src/notifyhub/frontend/`, `tests/notifyhub/frontend/`).
- The backend is a **pure JSON API + SSE server**: the `/static`, `/icons`, `/audio` mounts,
  the HTML template transform, and `GET /` are gone. The TUI is the only interactive client.
- Makefile: `frontend*` targets (`fe`, `fehl`, `fp`, `ftu`), `test-frontend*`, `test-chrome`, and
  the `chrome`/`vivaldi`/`vivaldi-beta` CDP launcher targets removed; `test-all` collapses to pytest.
- Docker: single-stage Python image (frontend build stage and `NPM_EXTRA_ARGS` dropped from the
  Dockerfile and compose); the `fe-dev` compose service deleted.
- Packaging: `jinja2` and `aiofiles` removed from `pyproject.toml` (both verified unused across
  `src/`).
- Docs: README rewritten 16 → 9 sections; repo `AGENTS.md` workflow is backend-only;
  `docs/_meta/how-to-prototype.md` loses its web-prototype chapter; `e2e-encryption.md`,
  `plugin-integration-testing.md`, and `the-tui.md` state "only the TUI decrypts / reads".
  Historical `docs/plans/**` files were left untouched.
- Operator decisions recorded: the CDP browser-launcher targets were removed (confirmed via a
  scoping question), and the change stays uncommitted for review.

## Trials, errors, and lessons learnt

1. **Scoping questions before deletion.** Two judgment calls were not ours to default on:
   whether to delete the dev-convenience browser launchers, and whether to commit. Both were
   asked up front (question tool) and the answers shaped the diff. Lesson: removals that delete
   developer conveniences deserve an explicit user decision, not an agent default.
2. **Removals fan out wider than additions.** Deleting the UI was not deleting one directory;
   the full surface was: StaticFiles mounts ×3, `load_and_transform_template()`, `GET /`,
   `TestRootEndpoint`, `test_template.py`, the Playwright POM suite, seven Makefile targets plus
   `test-all`'s line, a Docker build stage, a compose service and build-arg, two unused Python
   deps, the AGENTS.md hotload workflow, seven README sections, and two module-README deep links.
   Lesson: build the artifact list by grepping for everything the module *owned* — names
   (`StaticFiles`, `static/`), ports (`9070`), tools (`Playwright`, `Vite`, `bun run build`) —
   before removing; a leftover reference is a broken promise.
3. **Three `test_config.py` failures were pre-existing, not ours.** The post-change pytest run
   failed 3 config tests. Instead of guessing, the same suite ran in a pristine `git worktree`
   of `HEAD`: **identical failures**. Root cause: `confstackify` reads the live
   `~/.config/notifyhub/config.jsonl` and the exported `NOTIFYHUB_*` vars, so those tests are
   environment-sensitive, not hermetic. Lesson: when a config-layer test fails, verify against a
   pristine checkout before blaming the working tree — and config tests should patch the env and
   config path to be hermetic (candidate follow-up, out of scope here).
4. **`/tmp/opencode` was not writable for worktrees.** `git worktree add /tmp/opencode/...`
   failed with `Permission denied` creating leading directories; a sibling directory
   (`../nh-pristine-check`) worked and was removed with `git worktree remove --force` afterwards.
5. **README renumbering breaks deep links.** Shrinking the parent README 16 → 9 sections
   silently broke `README.md#11-backend-configuration` (backend README) and
   `README.md#15-cli-usage` (cli README). Found by grepping dependents for `README.md#N-`;
   both fixed. Lesson: a shared README's anchors are an implicit contract — after renumbering,
   grep every dependent for its anchors.
6. **Verify orphan claims before dropping deps.** `jinja2` and `aiofiles` looked frontend-owned
   but were *already* unused (zero imports in `src/`), so they were dropped as a bonus rather
   than "because the frontend went away". Lesson: attribute ownership with grep, not inference.
7. **Check what shares the asset before unmounting it.** Before removing the `/audio` static
   mount, the TUI was confirmed to ship its own copy (`src/notifyhub/tui/assets/Submarine.mp3`);
   otherwise the removal would have muted notification audio. 
8. **Re-read after a big write.** An edit attempt against the freshly rewritten README failed
   because its `oldString` was composed from memory of the *old* text. Harmless, but the rule
   stands: after a `write`, re-read before the next `edit`.

## Validation

- `python -m pytest tests/notifyhub -q`: 229 passed, 3 failed — the 3 failures are the
  environment-sensitive `test_config.py` cases proven pre-existing on pristine `HEAD`.
- Excluding that file: **177 passed** (backend, cli, plugins).
- Backend import check: app boots and the route inventory no longer contains `/`, `/static`,
  `/icons`, or `/audio`.
- Greps: no `frontend`, `StaticFiles`, or `load_and_transform` references remain in live code,
  Makefile, Docker files, or non-historical docs.
- The TUI's `bun test`/typecheck were not re-run — the TUI module was not modified.

## Remaining rollout

- Review and commit (intentionally left uncommitted).
- Re-run `pip install -e .` at convenience to prune `jinja2`/`aiofiles` from the environment;
  nothing breaks until then.
- `docker compose build be` to move to the single-stage image.
- Optional follow-up: make `tests/notifyhub/test_config.py` hermetic (patch `NOTIFYHUB_*` env and
  the config path) so it stops reading the operator's live `config.jsonl`.
