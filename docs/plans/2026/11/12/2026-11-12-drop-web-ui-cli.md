# CLI: README deep-link repair after parent renumbering

**Date**: 2026-11-12
**Parent**: [Drop web UI](2026-11-12-drop-web-ui.md)

## Changes

Documentation only — no CLI code, tests, or behavior changed this session.

- `src/notifyhub/cli/README.md`: parent-README link updated from
  `README.md#15-cli-usage` → `README.md#8-cli-usage`, because dropping the web UI sections
  renumbered the shared README from 16 to 9 sections.
- This session-record section added.

## Why

The CLI module was untouched by the web UI removal, but its README held a
deep link into the parent README, and section removals upstream renumbered the
`CLI Usage` heading from 15 to 8. The grep `README.md#[0-9]+-` across module
READMEs found it (together with the backend's `#11-backend-configuration`).

## Lesson learnt

- Anchors into a shared README are an implicit contract with every module that
  links to it. After renumbering a shared document, grep the dependents
  (`grep -rn "README.md#" --include="*.md" .`) — stale anchors 404 silently in
  rendered Markdown and are invisible to link checkers that only test file
  existence.

## Validation

- `python -m pytest tests/notifyhub/cli -q` passes unchanged.
- Anchor `#8-cli-usage` exists in the rewritten parent README's TOC.
