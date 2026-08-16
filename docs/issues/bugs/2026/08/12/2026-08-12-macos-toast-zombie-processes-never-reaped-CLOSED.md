# macOS toast zombies: `ToastHUD` child processes never reaped — CLOSED

**Date**: 2026-08-12
**Status**: ✅ FIXED
**Fix**: `src/notifyhub/macos_notify.py` — capture the returned `Popen` and reap it in a daemon thread
**Where**: `src/notifyhub/macos_notify.py:113-121` (caller) + `mactoast/_runner.py:501` (library)

## Symptom

The backend (`python -m notifyhub.backend.backend`) accumulates zombie (`<defunct>`)
child processes — **one zombie per connected display, per notification**:

```
$ ps axo pid,ppid,stat,etime,command | awk '$3 ~ /Z/'
76474 39758 Z  01:08 <defunct>
76475 39758 Z  01:08 <defunct>
76476 39758 Z  01:08 <defunct>
76477 39758 Z  01:08 <defunct>
```

4 zombies, identical age, all children of the backend (PID 39758), on a machine
with 4 displays. They persist indefinitely (until the *next* notification arrives).

Zombies hold no CPU/RAM — but they leak PID-table entries and pollute process
listings for the entire uptime of the backend.

## Root Cause

Chain of three interacting behaviors:

1. `send_macos_notification()` calls `mactoast.toast(..., blocking=False)` **once
   per screen** (`macos_notify.py:113-119` loops over `NSScreen.screens()`).
2. In non-blocking mode, mactoast returns a raw
   `subprocess.Popen(args, stdout=PIPE, stderr=PIPE)` (`_runner.py:501`) — the
   **caller owns reaping**.
3. `macos_notify.py` **discards the return value**. The `Popen` object is
   garbage-collected immediately, while `ToastHUD` is still running (default
   `display_duration` ≈ 2.5 s). CPython's `Popen.__del__` polls once, finds the
   child alive, and parks it on the `subprocess._active` list.

When `ToastHUD` exits, nothing waitpid()s it → zombie. `subprocess._cleanup()`
only runs on the *next* `Popen()` spawn (i.e., the next notification), so each
batch of zombies lingers until another notification happens to arrive.

## Reproduce

```bash
# terminal 1: watch zombies
watch -n2 'ps axo pid,ppid,stat,command | awk "\$3 ~ /Z/"'

# terminal 2: fire one notification
curl -X POST localhost:PORT/api/notify \
  -H 'Content-Type: application/json' \
  -d '{"data": {"message": "zombie test", "pwd": "/tmp"}}'
```

→ N zombies appear ~2.5 s later, where N = number of connected displays.

## Fix

Applied the caller-side reaping in `send_macos_notification()` — every
non-blocking `toast()` return value is now captured and `wait()`ed by a daemon
thread so the `ToastHUD` child is waitpid()ed as soon as it exits:

```python
def _reap(proc: tp.Any) -> None:
    try:
        proc.wait()
    except Exception:
        pass

# in send_macos_notification():
proc = toast(message, position=(x, y), **toast_kwargs)
if proc is not None:
    threading.Thread(target=_reap, args=(proc,), daemon=True).start()
```

Verified with a simulated child: 0 zombies after exit.

Alternative (better, upstream): fix in `mactoast` itself — non-blocking `toast()`
should spawn its own daemon reaper thread (or `start_new_session=True` +
double-fork) so callers can't leak zombies by ignoring the return value.
