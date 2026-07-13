# macOS Notification Center Support

**Target date:** 2026-07-13

---

## Summary

Push NotifyHub notifications to all connected macOS displays as toast overlays styled to match the NotifyHub frontend "noticard" component — colored avatar with initials, project basename title, and message body. Implemented via a locally customized `mactoast` library with a purpose-built Swift `ToastHUD.app`.

---

## Motivation

Currently, NotifyHub notifications only appear in the web UI (via SSE) and optionally on Telegram. If the user is not actively looking at the web UI, notifications can be missed. macOS toast overlays provide a native-feeling, always-visible delivery channel on all monitors.

---

## Final Architecture

### Data Flow

```
POST /api/notify
  ├─ store.add(data)          → SSE broadcast (web UI)
  ├─ Telegram (if configured) → async_send_telegram_message()
  └─ macOS (if enabled)       → send_macos_notification(text, pwd)
       ├─ _get_color_from_pwd(pwd)  → MD5-based deterministic avatar color
       ├─ _get_initials(basename)   → 1–3 character initials
       ├─ _estimate_toast_dimensions(msg)  → (width, height, corner_radius)
       ├─ _get_screen_positions(msg) → [(x, y), ...] for every display
       └─ for each screen:
            └─ mactoast.toast(msg, position=(x,y), *kwargs)
                 └─ subprocess: ToastHUD.app --x X --y Y --icon-text NH --icon-bg #7B1FA2 ...
                      └─ SwiftUI overlay on each monitor
```

### Files

| File | Role |
|------|------|
| `src/notifyhub/macos_notify.py` | Core logic: avatar color, initials, dimension estimation, screen positioning |
| `src/notifyhub/config.py` | `macos_notifications_enabled: bool` (CLI + env var) |
| `src/notifyhub/backend/backend.py` | Wires `send_macos_notification(text, pwd)` into `/api/notify` |
| `pyproject.toml` / `requirements.txt` | `mactoast` dependency |
| `_refs/mactoast/ToastHUD/ToastConfig.swift` | Added `--icon-text`, `--icon-bg` CLI flags |
| `_refs/mactoast/ToastHUD/ToastView.swift` | Custom avatar (colored initial badge), 2px border, top-aligned text, even padding, zero corner radius |
| `_refs/mactoast/ToastHUD/AppDelegate.swift` | Passes `iconBg` to `ToastView` |
| `_refs/mactoast/src/mactoast/_runner.py` | Added `icon_text`, `icon_bg` params → `--icon-text`, `--icon-bg` CLI args |

### CLI / Config Control

```
notifyhub-server --backend.macos-notifications-enabled false
NOTIFYHUB_BACKEND_MACOS_NOTIFICATIONS_ENABLED=false notifyhub-server
```

---

## Trials, Errors & Lessons Learned

### Attempt 1: `osascript` (rejected by user)
`osascript -e 'display notification "msg" with title "Title" sound name "default"'` — built-in, zero deps, native Notification Center. User rejected it as "sucks."

### Attempt 2: `macos-notifications` (library crash)
`pip install macos-notifications` — a `pyobjc`-based Python wrapper around `UNUserNotificationCenter`.

**Error:**
```
signal only works in main thread of the main interpreter
```
`client.create_notification()` spawns a `multiprocessing.Process` internally, but `NSUserNotificationCenter` APIs **must** run on the main thread of a GUI process. The spawned process gets `NSUserNotificationCenter.defaultUserNotificationCenter() → None` and crashes with `AttributeError: 'NoneType' object has no attribute 'setDelegate_'`.

**Lesson:** `NSUserNotificationCenter` / `UNUserNotificationCenter` APIs depend on a running `NSApplication` in a GUI-capable process. Server processes (e.g., FastAPI via `python -m`) are **not** GUI processes. Any library that spawns background processes for these APIs will fail on modern macOS.

**Attempt 2b (partial fix):** Called `send_macos_notification()` synchronously from the FastAPI handler (main thread) instead of via `asyncio.to_thread`. This fixed the thread error but the library still spawned a `multiprocessing.Process` internally, which crashed for the same reason. **Not fixable without rewriting the library.**

### Attempt 3: `mactoast` (initial integration)
`pip install mactoast` — launches a bundled native macOS app (`ToastHUD.app`) as a subprocess, avoiding all thread/process restrictions.

**Error 1:** `Unknown sound name: default`
- mactoast has its own sound names (`pop1`, `pop2`, etc.) — `"default"` is not valid.
- **Fix:** Switched to `pop2` (later to `Submarine.aiff` system sound, then disabled).

**Error 2:** Toast cut off by top edge of monitor
- mactoast uses Cocoa's bottom-left origin (0,0 at bottom-left). The Python wrapper passes `--x` and `--y` as the **bottom-left** corner of the window. So `y = screen_top - 60` placed the toast's **bottom** at that position, and the toast extended **upward** — above the screen.
- **Fix:** Computed actual toast height via `_estimate_toast_dimensions()` and set `y = screen_top - padding - height` so the toast's top edge sits exactly 60px below the visible frame top.

**Error 3:** `auto_size=True` in the Python wrapper didn't account for our custom avatar
- mactoast's `_calculate_auto_size()` uses `icon_width = 0` when no SF Symbol icon is passed. But our ToastView has a 28×28px avatar + 10px spacing = 38px icon width. This caused dimension mismatch between Python estimates and actual Swift rendering.
- **Fix:** Stopped using `auto_size=True`. Now use our own `_estimate_toast_dimensions()` (which accounts for the avatar) to compute `width`/`height`, and pass them explicitly.

**Error 4:** Toast appeared at bottom-right on only one screen
- Root cause: `_estimate_toast_dimensions()` was changed to return a 3-tuple `(width, height, corner_radius)`, but `_get_screen_positions()` still unpacked into only 2 variables → `ValueError` (silently caught by `except Exception: return []`) → empty positions list → fallback without `position=(x,y)` → mactoast defaulted to `bottomRight` on main screen.
- **Fix:** Added `, _` to the unpacking: `toast_width, toast_height, _ = _estimate_toast_dimensions(message)`.

**Lesson:** Silent `except Exception` blocks devour real bugs. A `logging.exception()` call in the catch handler would have surfaced this immediately.

**Error 5:** Corner radius looked "squashed" on short toasts
- Fixed `corner_radius=12` on a 44px-tall toast exceeds `height/2`, causing SwiftUI to clamp the curvature into an unnatural shape.
- **Fix:** Adaptive formula `min(8, height/2 - 4)` → eventually simplified to `0` (user preferred sharp corners).

**Error 6:** Text vertically centered in the toast
- `ZStack` centers its children by default. `HStack` inside `ZStack` had content floating mid-toast.
- **Fix:** Added `.frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)` to the padded `HStack` so content sticks to the top-left.

### Attempt 4: Icon with text (custom mactoast fork)
The user wanted a color-coded avatar with project initials, matching the frontend `NotificationCard` component. mactoast's `--icon` only supports SF Symbols — no way to display custom text in a colored badge.

**Solution:** Customized the mactoast Swift source (`_refs/mactoast/ToastHUD/`):
1. Added `--icon-text` flag (1–3 character initials) and `--icon-bg` flag (hex color) to `ToastConfig.swift`
2. Modified `ToastView.swift` to render a 28×28px `RoundedRectangle` with the avatar color, overlaid with white bold text
3. Added `icon_text` and `icon_bg` parameters to the Python `_runner.py`
4. Replicated the frontend's MD5-based deterministic color palette in `macos_notify.py` (`_get_color_from_pwd`)

### Final sound choice
- Defaulted to `None` (silent) after testing `pop2` (bundled mactoast sound) and `Submarine.aiff` (macOS system sound). User chose to disable sound for now.

### Build notes
- ToastHUD.app must be recompiled via `swiftc` whenever Swift source changes:
  ```
  swiftc -o src/mactoast/ToastHUD.app/Contents/MacOS/ToastHUD \
    ToastHUD/*.swift
  ```

---

## Error Handling

- `mactoast` not installed (`ImportError`): log debug, return `False`
- `AppKit` not importable (non-macOS, background thread): `_get_screen_positions()` returns `[]` → fallback to default position
- Notification failures never block `/api/notify` (same philosophy as Telegram)

---

## Testing

Manual testing on macOS only — the mactoast ToastHUD.app is macOS-specific and not available in CI:
1. Start backend: `make be`
2. Send a test notification: `make noti`
3. Verify toast appears on all monitors, centered at top, with colored avatar, project name, and message

Backend unit tests: `python -m pytest src/notifyhub/backend/__tests__/ -v` — 21/21 pass.

---

## Rollback

```
notifyhub-server --backend.macos-notifications-enabled false
```
or `NOTIFYHUB_BACKEND_MACOS_NOTIFICATIONS_ENABLED=false`. No other changes affect existing behavior.
