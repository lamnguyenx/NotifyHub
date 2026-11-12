#!/usr/bin/env python3
"""NotifyHub hook script for Claude Code.

Reads one Claude Code hook event as JSON on stdin, builds a NotifyHub
notification body, and spawns notifyhub-push.py (the NotifyHub CLI) in the
session's directory — the Claude Code counterpart of
plugins/opencode/notifyhub-plugin.ts.

Claude Code has no in-process event stream; instead it spawns this script per
event with the hook input on stdin. The wiring lives in ~/.claude/settings.json
(see install.py) or in hooks/hooks.json for plugin distribution:

  Stop                -> session.execution.succeeded  ([#tag:@USER] + [#tag:@ASSISTANT])
  StopFailure         -> session.execution.failed     ([#claude-code.error])
  Notification        -> permission.asked / form.created-like events
  PermissionRequest   -> optional immediate permission variant (not wired by default)

The script is side-effect only: it always exits 0 and never writes stdout, so
it can never block or alter a turn (a non-JSON stdout would be parsed as hook
output and may surface as a hook error). Push failures are reported on stderr,
which Claude Code routes to its debug log.
"""

import json
import os
import socket
import subprocess
import sys
import typing as tp
import urllib.request

MAX_LINES = 5
MAX_CHARS = 200
MAX_CHARS_TOLERANCE = 8

# Mirrors python booleanify (github.com/lamnguyenx/booleanify) — the same truth
# table the NotifyHub CLI uses for NOTIFYHUB_CLI_ENABLED. `None` = unset, empty,
# or unparseable; the CLI remains the authority in those cases.
BOOL_TRUE = frozenset({"1", "on", "t", "true", "y", "yes"})
BOOL_FALSE = frozenset({"0", "off", "f", "false", "n", "no"})

# Notification types that mean "Claude Code is blocked waiting for you".
# idle_prompt is skipped on purpose: Stop already notified for that turn, and
# auth/quota/plugin types are not attention requests the user must answer.
PERMISSION_TYPES = frozenset({"permission_prompt"})
QUESTION_TYPES = frozenset({"elicitation_dialog", "elicitation_url_dialog", "agent_needs_input"})
HANDLED_NOTIFICATION_TYPES = PERMISSION_TYPES | QUESTION_TYPES

DEFAULT_PUSH_TIMEOUT = 20  # async hooks; the CLI itself times out its HTTP POST at 10s
# Stop/StopFailure hooks run synchronously so `claude -p` cannot exit and kill
# them mid-run; the push spawn is capped to keep that wait short (the status
# POST itself has its own 2s timeout).
SYNC_PUSH_TIMEOUT = 5


def booleanify(value: tp.Optional[str]) -> tp.Optional[bool]:
    if value is None:
        return None
    v = value.strip().lower()
    if v in BOOL_TRUE:
        return True
    if v in BOOL_FALSE:
        return False
    return None


def notifications_muted() -> bool:
    """True when notifications are muted: NOTIFYHUB_CLI_ENABLED resolves to an
    explicit false, or host/port was exported as an empty string. Skipping the
    spawn saves a process start; the CLI applies the same rules when invoked."""
    if booleanify(os.environ.get("NOTIFYHUB_CLI_ENABLED")) is False:
        return True
    for name in ("NOTIFYHUB_CLI_HOST", "NOTIFYHUB_CLI_PORT"):
        value = os.environ.get(name)
        if value is not None and not value.strip():
            return True
    return False


def truncate_text(*texts: str) -> str:
    """Python port of truncateText in notifyhub-plugin.ts: keep the last
    MAX_LINES lines then the last MAX_CHARS chars, snapping forward to a space
    or newline (within MAX_CHARS_TOLERANCE) so truncation starts at a word
    boundary, and prefix the [#truncated:...] markers the NotifyHub UIs render."""
    lines = "\n".join(texts).split("\n")
    kept = lines[-MAX_LINES:]
    truncated_lines = max(0, len(lines) - len(kept))

    cleaned = "\n".join(kept).rstrip("\n")
    original_length = len(cleaned)

    if len(cleaned) > MAX_CHARS:
        target = len(cleaned) - MAX_CHARS
        search_end = min(len(cleaned), target + MAX_CHARS_TOLERANCE)
        snap = -1
        for i in range(target, search_end):
            if cleaned[i] in (" ", "\n"):
                snap = i
                break
        cleaned = cleaned[snap + 1 :].lstrip(" \n") if snap >= 0 else cleaned[-MAX_CHARS:]

    truncated_chars = max(0, original_length - len(cleaned))
    prefix = ""
    if truncated_lines > 0:
        prefix += f"[#truncated:+{truncated_lines} LINES]"
    if truncated_chars > 0:
        prefix += f"[#truncated:+{truncated_chars} CHARS]"
    return (prefix + cleaned).strip()


def last_user_text(transcript_path: str) -> str:
    """Last real user message from the session transcript JSONL: skips meta
    entries (command wrappers, hook injections), sidechain/subagent turns, and
    tool-result-only messages. The transcript may lag in-memory state, but the
    prompt that started this turn is written long before Stop fires."""
    result = ""
    try:
        with open(transcript_path, encoding="utf-8", errors="replace") as fh:
            for line in fh:
                try:
                    entry = json.loads(line)
                except json.JSONDecodeError:
                    continue
                if not isinstance(entry, dict) or entry.get("type") != "user":
                    continue
                if entry.get("isMeta") or entry.get("isSidechain"):
                    continue
                message = entry.get("message")
                if not isinstance(message, dict):
                    continue
                content = message.get("content")
                if isinstance(content, str):
                    candidate = content
                elif isinstance(content, list):
                    parts = [
                        item.get("text", "")
                        for item in content
                        if isinstance(item, dict) and item.get("type") == "text"
                    ]
                    candidate = "\n".join(part for part in parts if part)
                else:
                    continue
                candidate = candidate.strip()
                if candidate:
                    result = candidate
    except OSError:
        pass
    return result


def notification_body(payload: tp.Dict[str, tp.Any]) -> tp.Optional[str]:
    event = payload.get("hook_event_name")

    if event == "Stop":
        # A stop caused by another Stop hook continuing the turn is not a
        # user-visible completion; notifying would duplicate the real one.
        if payload.get("stop_hook_active"):
            return None
        message = payload.get("last_assistant_message") or ""
        user = last_user_text(payload.get("transcript_path") or "")
        user_part = truncate_text(user) if user else ""
        assistant_part = truncate_text(message)
        return f"[#tag:@USER] {user_part}\n[#tag:@ASSISTANT] {assistant_part}"

    if event == "StopFailure":
        # last_assistant_message holds the rendered error text on this event.
        message = (
            payload.get("last_assistant_message")
            or payload.get("error_details")
            or payload.get("error")
            or "unknown error"
        )
        return f"[#claude-code.error] {message}"

    if event == "Notification":
        kind = payload.get("notification_type")
        message = (payload.get("message") or "").strip()
        if kind in PERMISSION_TYPES:
            return f"[#claude-code.permission] {message or 'Claude Code needs your permission'}"
        if kind in QUESTION_TYPES:
            return f"[#claude-code.question] {message or 'Claude Code is asking you a question'}"
        return None

    if event == "PermissionRequest":
        # Not wired by default; documented for users who want permission pings
        # without the "away from terminal" gate that permission_prompt has.
        tool = payload.get("tool_name") or "a tool"
        return f"[#claude-code.permission] Claude Code needs your permission to use {tool}"

    return None


def push(message: str, directory: tp.Optional[str], timeout: float = DEFAULT_PUSH_TIMEOUT, session_id: str = "") -> None:
    script = os.environ.get("NOTIFYHUB_PUSH_SCRIPT") or os.path.join(
        os.path.expanduser("~"), ".config", "opencode", "plugin", "notifyhub-push.py"
    )
    # The push script reports its own os.getcwd() as the notification "pwd", so
    # run it in the session's directory (~/.claude/settings.json hooks run in
    # the launch cwd; hooks read the real "cwd" from the payload instead).
    cwd = directory if directory and os.path.isdir(directory) else None
    try:
        result = subprocess.run(
            [sys.executable, script, message],
            cwd=cwd,
            capture_output=True,
            text=True,
            timeout=timeout,
            env={**os.environ, "NOTIFYHUB_SESSION_ID": session_id} if session_id else None,
        )
        if result.returncode != 0:
            output = (result.stdout + result.stderr).strip()
            print(f"NotifyHub notification failed: {output}", file=sys.stderr)
    except FileNotFoundError:
        print(f"NotifyHub push script not found: {script}", file=sys.stderr)
    except subprocess.TimeoutExpired:
        print("NotifyHub notification timed out", file=sys.stderr)


# No proxy: status goes straight to the backend, mirroring requests'
# trust_env=False in the CLI.
_DIRECT_OPENER = urllib.request.build_opener(urllib.request.ProxyHandler({}))


def machine_label() -> str:
    label = os.environ.get("HOST_MODEL", "").strip()
    if label in ("", "Unknown"):
        label = os.environ.get("HOSTNAME", "").strip() or socket.gethostname().strip()
    return label


def post_status(payload: tp.Dict[str, tp.Any], state: str) -> None:
    """Best-effort lifecycle report to POST /api/status/claude/<state>.

    Same NOTIFYHUB_CLI_HOST/PORT/SCHEME resolution as the push CLI, honoring
    the mute rules. Failures are silent: hooks are async (`async: true` in
    settings.json), so this never blocks the turn and must never fail it.
    """
    if notifications_muted():
        return
    session = str(payload.get("session_id") or "").strip()
    if not session:
        return
    host = os.environ.get("NOTIFYHUB_CLI_HOST") or "127.0.0.1"
    port = os.environ.get("NOTIFYHUB_CLI_PORT") or "9080"
    scheme = os.environ.get("NOTIFYHUB_CLI_SCHEME") or "http"
    body = json.dumps(
        {
            "session_id": session,
            "cwd": payload.get("cwd"),
            # Match the shared push CLI so live and completed cards agree.
            "host": machine_label(),
        }
    ).encode()
    request = urllib.request.Request(
        f"{scheme}://{host}:{port}/api/status/claude/{state}",
        data=body,
        headers={"content-type": "application/json"},
        method="POST",
    )
    try:
        with _DIRECT_OPENER.open(request, timeout=2):
            pass
    except Exception:
        pass


def status_event(payload: tp.Dict[str, tp.Any]) -> tp.Optional[str]:
    """Map a hook event to a lifecycle state, or None when it has none."""
    event = payload.get("hook_event_name")
    if event == "Stop":
        # A stop that another Stop hook continues is not a real completion;
        # the turn keeps running, so the status must stay "running".
        return None if payload.get("stop_hook_active") else "idle"
    if event == "StopFailure":
        return "idle"
    if event == "Notification" and str(
        payload.get("notification_type") or ""
    ) in HANDLED_NOTIFICATION_TYPES:
        return "blocked"
    return None


def main() -> None:
    try:
        payload = json.loads(sys.stdin.read() or "{}")
    except json.JSONDecodeError as error:
        print(f"NotifyHub hook: bad JSON input: {error}", file=sys.stderr)
        return
    if not isinstance(payload, dict):
        return
    status = status_event(payload)
    if status:
        post_status(payload, status)
    message = notification_body(payload)
    if message is None or notifications_muted():
        return
    event = payload.get("hook_event_name")
    timeout = SYNC_PUSH_TIMEOUT if event in ("Stop", "StopFailure") else DEFAULT_PUSH_TIMEOUT
    session = str(payload.get("session_id") or "").strip()
    push(message, payload.get("cwd"), timeout=timeout, session_id=session)


if __name__ == "__main__":
    main()
