# CLI: reliable `host_model` fallback

**Date**: 2026-11-11
**Status**: Done
**Parent**: [`2026-11-11-tui-waiting-card-machine-id.md`](2026-11-11-tui-waiting-card-machine-id.md)

Module: `src/notifyhub/cli/` — `cli.py`; tests in `tests/notifyhub/cli/test_cli.py`.

## Goal

The waiting card got its machine name from the status reporter, but the completed notification got
`host_model` from the push CLI. The CLI only looked at `HOST_MODEL` and `HOSTNAME`. `HOSTNAME` is a
bash shell variable and is often **not exported**, so a notification pushed from such a shell had
no machine tag at all — the waiting-card pill disappeared when the completion card landed.

## What changed

```python
host_model = os.environ.get("HOST_MODEL", "").strip()
if host_model in ("", "Unknown"):
    # HOSTNAME is a bash variable but often not exported; ask the OS so every
    # push carries the machine tag even when the parent shell omitted it.
    host_model = os.environ.get("HOSTNAME", "").strip() or socket.gethostname().strip()
```

Resolution order is now:

1. `HOST_MODEL` — explicit label / model override.
2. Exported `HOSTNAME` — preserves the old behaviour where it exists.
3. `socket.gethostname()` — OS fact fallback.
4. No `host_model` only if even the OS returns an empty string.

Claude, Codex and OpenCode all push through this CLI, so the fallback covers all three
integrations without changing the reporters.

## Design decisions

- **Override first, OS last.** Users who set `HOST_MODEL` keep full control; the OS is a fallback,
  not a replacement.
- **Keep `HOSTNAME` in the middle.** Environments that intentionally export a different name
  (containers, wrappers) keep working exactly as before.
- **One source for the tag when no override is set.** With `HOST_MODEL` unset, the status `host`
  and the notification `host_model` now identify the same machine. An explicit `HOST_MODEL` remains
  an intentional override (for example a model label).
- **No message-shape change.** Only `data.host_model` is added, as before; the TUI already renders
  it.

## Trials, errors and lessons

### `HOSTNAME` looked universal but is not exported

`env | grep HOSTNAME` is empty in a default bash shell, while `echo $HOSTNAME` prints the name.
Python's `os.environ` only sees exported variables, so the fallback silently did nothing.

**Lesson**: prefer the OS API (`socket.gethostname()`) for machine facts. Environment variables are
for overrides, not for identity.

### The unit test had to clear both variables

`clean_env()` strips `NOTIFYHUB_*` only. The host shell can export `HOSTNAME`, and a developer may
have `HOST_MODEL` set. The fallback test sets both to `""` so it exercises the socket branch.

**Lesson**: sanitize every input that participates in the branch under test.

### The CLI is installed as a copy

`make install-plugin` copies `cli.py` to `~/.config/opencode/plugin/notifyhub-push.py`. Editing the
repo does not update an existing install. The output after the fix was a stale copy until the
installer ran again.

**Lesson**: document the reinstall step next to copy-based integrations; "the code is fixed" is
not "the installed hook is fixed".

## Verification

- `HOST_MODEL=gpt-4 HOSTNAME=Mac153` → `host_model == "gpt-4"`.
- `HOST_MODEL="" HOSTNAME=Mac153` → `host_model == "Mac153"`.
- `HOST_MODEL="" HOSTNAME=""` → `host_model == socket.gethostname()`.
- `python -m pytest tests/notifyhub/cli -q`: **33 passed**.
- Dry-run payloads still include `pwd` and `message` unchanged.

## Docs updated

- `docs/important/the-tui.md` §2 — host-model resolution note.
- Root `README.md` §15/§16 and `src/notifyhub/tui/README.md` — machine-tag consistency.
- Plan index: [`2026-11-11-agent-status-host-header-plugins.md`](2026-11-11-agent-status-host-header-plugins.md).

## Related

- Parent: [`2026-11-11-tui-waiting-card-machine-id.md`](2026-11-11-tui-waiting-card-machine-id.md)
- Backend: [`2026-11-11-agent-status-host-header-backend.md`](2026-11-11-agent-status-host-header-backend.md)
- Plugins: [`2026-11-11-agent-status-host-header-plugins.md`](2026-11-11-agent-status-host-header-plugins.md)
