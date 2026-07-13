from __future__ import annotations

import hashlib
import logging
import os
import typing as tp

_MAX_WIDTH = 480
_MIN_WIDTH = 100
_FONT_SIZE = 14
_TOP_PADDING = 60

# _SOUND = "/System/Library/Sounds/Submarine.aiff"
_SOUND = None

_AVATAR_COLORS = [
    "#7B1FA2", "#77919D", "#455A65", "#EC417A", "#C1175C",
    "#5D6AC0", "#0388D2", "#00579B", "#0098A7", "#00897B",
    "#004D40", "#68A039", "#EF6C00", "#F6511E", "#BE360B",
]


def _get_color_from_pwd(pwd: tp.Optional[str]) -> str:
    if not pwd:
        return _AVATAR_COLORS[0]
    short_hash = hashlib.md5(pwd.encode()).hexdigest()[:10]
    h = 0
    for c in short_hash:
        h = ((h << 5) - h) + ord(c)
        h = h & 0xFFFFFFFF
    return _AVATAR_COLORS[abs(h) % len(_AVATAR_COLORS)]


def _get_initials(name: str) -> str:
    if not name:
        return ""
    words = name.strip().split()
    if len(words) > 1:
        return "".join(w[0] for w in words).upper()[:3]
    return name[0].upper()


def _estimate_toast_dimensions(message: str) -> tuple[float, float, float]:
    """Estimate auto-sized toast dimensions matching ToastView layout.
    Returns (width, height, corner_radius)."""
    avg_char_width = _FONT_SIZE * 0.6
    icon_width = 28 + 10  # avatar size + HStack spacing
    h_padding = 14 * 2    # horizontal padding
    v_padding = 14 * 2    # vertical padding

    text_width = len(message) * avg_char_width
    natural_width = text_width + icon_width + h_padding

    if natural_width <= _MAX_WIDTH:
        width = max(_MIN_WIDTH, natural_width)
        height = max(44, _FONT_SIZE * 1.2 + v_padding)
    else:
        width = _MAX_WIDTH
        available_width = _MAX_WIDTH - icon_width - h_padding
        chars_per_line = max(1, int(available_width / avg_char_width))
        num_lines = max(1, (len(message) + chars_per_line - 1) // chars_per_line)
        height = (_FONT_SIZE * 1.4 * num_lines) + v_padding + 8

    corner_radius = 0
    return (width, height, corner_radius)


def _get_screen_positions(message: str) -> list[tuple[float, float]]:
    try:
        import AppKit

        toast_width, toast_height, _ = _estimate_toast_dimensions(message)
        positions = []
        for screen in AppKit.NSScreen.screens():
            vf = screen.visibleFrame()
            x = vf.origin.x + vf.size.width / 2 - toast_width / 2
            y = vf.origin.y + vf.size.height - _TOP_PADDING - toast_height
            positions.append((x, y))
        return positions
    except Exception:
        return []


def send_macos_notification(
    text: str = "",
    pwd: tp.Optional[str] = None,
    sound: str = _SOUND,
) -> bool:
    """Show a macOS toast notification matching the NotifyHub noticard design."""
    try:
        from mactoast import toast

        basename = os.path.basename(str(pwd)) if pwd else ""
        initials = _get_initials(basename)
        avatar_color = _get_color_from_pwd(pwd or "")

        message = f"{basename}\n{text}" if basename and text else (basename or text)
        toast_width, toast_height, corner_radius = _estimate_toast_dimensions(message)
        positions = _get_screen_positions(message)

        toast_kwargs = dict(
            sound=sound,
            width=toast_width,
            height=toast_height,
            font_size=_FONT_SIZE,
            blocking=False,
            bg=(0.08, 0.08, 0.08, 0.92),
            corner_radius=corner_radius,
            icon_text=initials,
            icon_bg=avatar_color,
        )

        if positions:
            for x, y in positions:
                toast(
                    message,
                    position=(x, y),
                    **toast_kwargs,
                )
        else:
            toast(message, **toast_kwargs)

        return True
    except ImportError:
        logging.debug("mactoast library not installed; skipping macOS notification")
        return False
    except Exception as exc:
        logging.warning(f"Failed to send macOS notification: {exc}")
        return False
