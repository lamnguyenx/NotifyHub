# Codex hook definitions: python turn-start on every platform

**Date**: 2026-11-13
**Status**: Done
**Parent**: [`2026-11-13-agent-status-heartbeats-codex.md`](2026-11-13-agent-status-heartbeats-codex.md)

Module: `src/notifyhub/plugins/codex/hooks/` (`hooks.json`) and the
installer's matching `HOOK_EVENTS` in `install.py`; README updated.

## What changed

- `UserPromptSubmit`: the Unix curl one-liner (with the Windows py
  `commandWindows` fallback) → the python reporter on **both** platforms
  (`python3 "${PLUGIN_ROOT}/notifyhub-codex.py"` / `py -3 "%PLUGIN_ROOT%
  \notifyhub-codex.py"`, async, 10s). Rationale: one prompt per turn is cold;
  the reporter already implemented Windows-only prompt forwarding + label
  precedence, so unix behavior and windows behavior collapsed into one code
  path instead of two.
- `install.py` keeps `status_curl_handler()` explicitly labeled "legacy, kept
  for uninstall matching": its `STATUS_HOOK_MARKER` still matches installs
  carrying the old curl entry, and `merge_hooks` replaces in place, so an
  upgrade silently swaps the entry without moving it past foreign hooks
  (Codex's trust key includes the entry position).
- Timeout raised from the curl era's 3s to 10s async — the py spawn includes
  interpreter start plus a watcher spawn; still async, so it never delays
  the prompt.

## Lesson: deleting a handler vs keeping it as a tombstone

Uninstall matching and upgrade-in-place both key off command shapes. Deleting
the builder outright would strand legacy entries in existing installs;
keeping it with a "legacy" docstring and zero call sites in `HOOK_EVENTS`
costs ten lines and makes `--remove` correct forever. The tombstone pattern
is also self-documenting — the installer reads as a history of wirings.

## Verification

Installer tests: py-handler turn-start (async, marker, no curl), legacy curl
group replaced by re-merge, strip removes it. Layout test asserts
`hooks.json` uses `${PLUGIN_ROOT}` python on `UserPromptSubmit` with no
`curl` anywhere in the command.
