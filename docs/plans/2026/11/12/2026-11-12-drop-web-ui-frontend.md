# Web frontend: decommissioned

**Date**: 2026-11-12
**Parent**: [Drop web UI](2026-11-12-drop-web-ui.md)
**Status**: Module deleted from the working tree; recoverable from git history before this change.

## What it was

- React 18 + Mantine v8 + Vite 5 (bun-managed) single-page app in `src/notifyhub/frontend/`
  (38 tracked files): live SSE wiring (`useNotifications`), shared ticking clock (`useNow`),
  autoplay audio with click-to-unmute (`useAudio`), TUI-mirrored notification/waiting cards,
  lazy `?before=` pagination, status/help popups, and a prototype harness
  (`prototype.html` + `src/prototypes/`, same copy-on-write loop as the TUI).
- E2E testing: Playwright over CDP against a manually launched Chrome, with a backup-and-restore
  strategy for the live notification store (`tests/notifyhub/frontend/`, POM pages).
- Last substantial work: commit `cf929f4` "Rework web UI to match the TUI notification design".

## Why removed

- The TUI is the reference implementation of the card design and the **only** client able to
  decrypt e2e envelopes (the web UI rendered `LOCKED` cards by design), so with e2e on the web UI
  could not even display its primary content.
- It duplicated the TUI's design at a maintenance cost: a second bun dependency tree, a Playwright
  browser stack, a Vite proxy configuration, a Docker build stage plus `fe-dev` service, and seven
  Makefile targets.

## Verified safe before deletion

- **Audio**: the TUI ships its own copy (`src/notifyhub/tui/assets/Submarine.mp3`); the browser
  `/audio` mount had no other consumer.
- **Reading notifications**: nothing was web-only — the TUI covers viewing, selection, deletion,
  pagination, waiting cards; the CLI and plugins are push-only by design.

## Where its concerns live now

| Web UI concern | New home |
|---|---|
| Card / waiting-card design language | TUI (reference) + `docs/important/the-tui.md` |
| Prototype loop (scenario harness) | `make tui-prototype` + `docs/_meta/how-to-prototype.md` |
| SSE client pattern (init → live events, count poll) | `src/notifyhub/tui/src/hooks` / `utils/api.ts` |

## Mechanics

- `git rm -r src/notifyhub/frontend tests/notifyhub/frontend tests/notifyhub/backend/test_template.py`
  staged the 38 tracked files, then `rm -rf` cleared the untracked `node_modules/` and `static/`
  build output that git ignores.

## Lessons learnt

1. **Deleting a UI is mostly deleting its support web.** The React sources were the minority of
   the diff; the majority was its serving (mounts, template transform), testing (two test trees),
   packaging (Docker stage, compose service, pyproject deps), workflow (Makefile, AGENTS.md) and
   documentation (README sections, guides). Budget the investigation, not the `rm`.
2. **A client that cannot display its data under the security model is already dead.** The e2e
   "web does not decrypt" design decision is what made this removal safe — when a second client is
   structurally incapable of the primary feature, question why it exists.
3. **Decommission records are worth writing even for deleted code.** The module's design history
   (which scenarios the prototype covered, how audio-unmute worked) is otherwise only in git
   archaeology.
