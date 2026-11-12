# Config markdown regeneration: `make config-md` repaired in passing

**Date**: 2026-11-12
**Status**: Implemented in the working tree.
**Parent**: [SSH rollout](2026-11-12-install-plugin-ssh.md)

## Module and changes

Testing design 1's config surface needed `config.md` regenerated, and `make config-md`
failed before doing anything:

```
AttributeError: generate_markdown
```

The target called `NotifyHubConfig.generate_markdown()`, but the generation entry point
lives in confstack as `generate_config_markdown(cls, app_name)` — the method had moved
upstream. The target now runs:

```python
from confstack import generate_config_markdown
from notifyhub.config import NotifyHubConfig
generate_config_markdown(NotifyHubConfig, 'notifyhub')
```

Regenerating also caught up rows the committed `config.md` had drifted out of sync on:
`e2e.enabled`, `e2e.key`, and `plugins.opencode.muted_agents` now appear alongside the
previously-documented backend/cli rows. The file is generated output; the commit carries
it refreshed rather than hand-editing rows in.

## Trials, errors, and lessons learnt

1. A broken make target with no test surfaced only when a second feature needed it. The
   fix was one line plus an import — `grep confstack` for the real symbol
   (`generate_config_markdown` appeared in `dir(confstack)`) instead of guessing the
   method's new home.
2. Generated artifacts rot silently: the committed table was missing whole config sections
   that had existed for weeks. Regenerating after config-model changes (or in CI, diffing
   against the committed file) keeps `config.md` trustworthy.
3. While validating, `tests/notifyhub/test_config.py` showed 3 failures. Stashing the
   working tree and re-running reproduced them at HEAD — pre-existing
   `notifications_max_count` default drift, unrelated to this work — so they were left
   untouched and recorded rather than "fixed" in passing. Confirm ownership of a red test
   before repairing it inside an unrelated change.

## Validation

- `make config-md` exits 0 and rewrites `src/notifyhub/config.md`.
- The regenerated table contains `install`-free rows for the then-current config model
  (the `install` block from design 1 was reverted; see
  [Host selection](2026-11-12-install-plugin-ssh-host-selection.md)).
- `git diff src/notifyhub/config.md` shows only additive rows for previously-missing keys.
- `pytest tests/notifyhub/test_config.py -q`: 52 passed, 3 pre-existing failures.
