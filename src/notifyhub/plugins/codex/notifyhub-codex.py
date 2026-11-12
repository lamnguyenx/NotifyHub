#!/usr/bin/env python3
"""NotifyHub hook script for OpenAI Codex.

Reads one Codex lifecycle hook event as JSON on stdin, builds a NotifyHub
notification body, and spawns notifyhub-push.py (the NotifyHub CLI) in the
session's directory — the Codex counterpart of
plugins/opencode/notifyhub-plugin.ts and plugins/claude/notifyhub-claude.py.

Codex spawns this script per event with the hook input on stdin. The wiring
lives in ~/.codex/hooks.json (see install.py) or in hooks/hooks.json for
plugin distribution:

  Stop              -> turn completion ([#tag:@USER] + [#tag:@ASSISTANT])
  Interrupt         -> interrupted turn (same body, transcript-recovered)
  PostModelRequest  -> model request failure ([#codex.error])
  PermissionRequest -> [#codex.permission] ... (only when a human must decide)
  PreToolUse (request_user_input) -> [#codex.question] ...

The script is side-effect only: it always exits 0 and never writes stdout.
Codex parses stdout as JSON for Stop/Interrupt and treats plain text as
invalid, so writing nothing is the safe no-op. Push failures go to stderr.
"""

import hashlib
import json
import os
import socket
import subprocess
import sys
import tempfile
import time
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

DEFAULT_PUSH_TIMEOUT = 20  # async hooks; the CLI itself times out its HTTP POST at 10s
SYNC_PUSH_TIMEOUT = 5  # Stop/PostModelRequest block the turn; fail fast if the server is down
INTERRUPT_PUSH_TIMEOUT = 2.5  # Codex caps Interrupt hooks at 3s
STATE_TTL_SECONDS = 7 * 24 * 60 * 60  # keep dedupe claims for a week

# Codex annotates transcript message entries with the turn they belong to and
# with content kinds. These kinds are harness context, not the user's prompt.
NON_USER_CONTENT_KINDS = (
    "agents_md.",
    "environments.",
    "permissions.",
    "multi_agent.",
)

# Older transcripts (before content kinds) put harness context in role=user
# messages; skip the wrappers by their leading text.
NON_USER_PREFIXES = (
    "<environment_context>",
    "<permissions instructions>",
    "# AGENTS.md instructions",
)


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


def message_text(payload: tp.Dict[str, tp.Any]) -> str:
    """Text from a Codex response_item message payload."""
    content = payload.get("content")
    if isinstance(content, str):
        return content
    if not isinstance(content, list):
        return ""
    parts = []
    for item in content:
        if not isinstance(item, dict):
            continue
        if item.get("type") in ("input_text", "output_text", "text"):
            text = item.get("text")
            if isinstance(text, str) and text:
                parts.append(text)
    return "\n".join(parts)


def message_meta(payload: tp.Dict[str, tp.Any]) -> tp.Dict[str, tp.Any]:
    meta = payload.get("internal_chat_message_metadata_passthrough")
    return meta if isinstance(meta, dict) else {}


def is_user_prompt(payload: tp.Dict[str, tp.Any], meta: tp.Dict[str, tp.Any]) -> bool:
    """True for the user's actual prompt, false for harness wrappers such as
    AGENTS.md instructions, environment context, and permission reminders."""
    kinds = meta.get("content_item_kinds")
    if isinstance(kinds, list) and kinds:
        if "user.text" in kinds:
            return True
        if any(str(kind).startswith(NON_USER_CONTENT_KINDS) for kind in kinds):
            return False
    provenance = meta.get("content_item_metadata")
    if isinstance(provenance, list):
        for item in provenance:
            if isinstance(item, dict):
                source = item.get("provenance")
                if isinstance(source, dict) and source.get("type") == "user":
                    return True
    text = message_text(payload).lstrip()
    return bool(text) and not text.startswith(NON_USER_PREFIXES)


def transcript_texts(transcript_path: str, turn_id: str) -> tp.Tuple[str, str]:
    """Recover the user prompt and assistant message for a turn from the Codex
    rollout transcript. Stop already delivers last_assistant_message; this is
    the fallback for Interrupt and for Stop events whose message is null.

    The transcript is a JSONL rollout: assistant/user text lives in
    response_item/message payloads, and the final answer is also mirrored in an
    event_msg/task_complete payload. Entries are filtered by turn_id when
    present, so a notification never reports a prior turn."""
    user_text = ""
    assistant_text = ""
    user_fallback = ""
    assistant_fallback = ""

    try:
        with open(transcript_path, encoding="utf-8", errors="replace") as fh:
            for line in fh:
                try:
                    entry = json.loads(line)
                except json.JSONDecodeError:
                    continue
                if not isinstance(entry, dict):
                    continue
                payload = entry.get("payload")
                if not isinstance(payload, dict):
                    continue

                if entry.get("type") == "response_item" and payload.get("type") == "message":
                    meta = message_meta(payload)
                    meta_turn = str(meta.get("turn_id") or "")
                    role = payload.get("role")
                    text = message_text(payload).strip()
                    if not text:
                        continue
                    if role == "user":
                        if not is_user_prompt(payload, meta):
                            continue
                        user_fallback = text
                        if turn_id and meta_turn == turn_id:
                            user_text = text
                    elif role == "assistant":
                        assistant_fallback = text
                        if turn_id and meta_turn == turn_id:
                            assistant_text = text
                    continue

                if entry.get("type") == "event_msg" and payload.get("type") == "task_complete":
                    text = payload.get("last_agent_message")
                    if not isinstance(text, str) or not text.strip():
                        continue
                    text = text.strip()
                    event_turn = str(payload.get("turn_id") or payload.get("root_turn_id") or "")
                    assistant_fallback = text
                    if turn_id and event_turn == turn_id:
                        assistant_text = text
    except OSError:
        pass

    return (user_text or user_fallback, assistant_text or assistant_fallback)


def turn_context(transcript_path: str, turn_id: str) -> tp.Dict[str, tp.Any]:
    """Resolved settings Codex recorded for a turn in the rollout transcript.

    The PermissionRequest payload only carries `permission_mode`, which maps
    every approval policy except "never" to "default"; it cannot tell a user
    prompt apart from an automatic review. The transcript's `turn_context`
    entry can: it records `approvals_reviewer` ("user" or "auto_review") and the
    effective `approval_policy`. Return the last matching entry so mid-turn
    setting changes win."""
    if not transcript_path or not turn_id:
        return {}
    context: tp.Dict[str, tp.Any] = {}
    try:
        with open(transcript_path, encoding="utf-8", errors="replace") as fh:
            for line in fh:
                try:
                    entry = json.loads(line)
                except json.JSONDecodeError:
                    continue
                if not isinstance(entry, dict) or entry.get("type") != "turn_context":
                    continue
                payload = entry.get("payload")
                if not isinstance(payload, dict):
                    continue
                if str(payload.get("turn_id") or "") != turn_id:
                    continue
                context = payload
    except OSError:
        pass
    return context


def needs_human_permission(payload: tp.Dict[str, tp.Any]) -> bool:
    """True when a PermissionRequest will actually stop for a person.

    Full Access (`permission_mode: bypassPermissions`) and Never never prompt.
    `approvals_reviewer: auto_review` hands approvals to Codex's guardian, so
    the user sees nothing to act on; notifying would be a false alarm. Missing
    transcript fields keep the notification, since older Codex versions may not
    record the turn context."""
    if payload.get("permission_mode") == "bypassPermissions":
        return False
    context = turn_context(
        str(payload.get("transcript_path") or ""), str(payload.get("turn_id") or "")
    )
    if context.get("approval_policy") == "never":
        return False
    return context.get("approvals_reviewer") != "auto_review"


def question_text(tool_input: tp.Any) -> str:
    """Question(s) from a request_user_input tool call."""
    if not isinstance(tool_input, dict):
        return ""
    questions = tool_input.get("questions")
    if not isinstance(questions, list):
        return ""
    texts = []
    for question in questions:
        if not isinstance(question, dict):
            continue
        text = question.get("question") or question.get("header")
        if isinstance(text, str) and text.strip():
            texts.append(text.strip())
    return "\n".join(texts)


def notification_body(payload: tp.Dict[str, tp.Any]) -> tp.Optional[str]:
    event = payload.get("hook_event_name")
    transcript = payload.get("transcript_path") or ""
    turn_id = str(payload.get("turn_id") or "")

    if event in ("Stop", "Interrupt"):
        # A stop caused by another Stop hook continuing the turn is not a
        # user-visible completion; notifying would duplicate the real one.
        if event == "Stop" and payload.get("stop_hook_active"):
            return None
        user_text, transcript_assistant = transcript_texts(transcript, turn_id)
        if event == "Stop":
            message = payload.get("last_assistant_message") or transcript_assistant
            fallback = "Codex finished a turn"
        else:
            message = transcript_assistant
            fallback = "Codex turn interrupted"
        user_part = truncate_text(user_text) if user_text else ""
        assistant_part = truncate_text(message) if message else fallback
        return f"[#tag:@USER] {user_part}\n[#tag:@ASSISTANT] {assistant_part}"

    if event == "UserPromptSubmit":
        return "running"

    if event == "PostModelRequest":
        # Fires for every model request attempt, including retries. Only a
        # failed attempt is interesting; completed/cancelled attempts are not.
        if payload.get("status") != "failed":
            return None
        error = str(payload.get("error") or "").strip() or "model request failed"
        return f"[#codex.error] {error}"

    if event == "PermissionRequest":
        if not needs_human_permission(payload):
            return None
        tool_input = payload.get("tool_input")
        description = tool_input.get("description") if isinstance(tool_input, dict) else None
        tool = payload.get("tool_name") or "a tool"
        if isinstance(description, str) and description.strip():
            return f"[#codex.permission] {description.strip()}"
        return f"[#codex.permission] Codex needs your permission to use {tool}"

    if event == "PreToolUse":
        if payload.get("tool_name") != "request_user_input":
            return None
        text = question_text(payload.get("tool_input"))
        return f"[#codex.question] {text or 'Codex is asking you a question'}"

    return None


def prune_state(directory: str) -> None:
    cutoff = time.time() - STATE_TTL_SECONDS
    try:
        with os.scandir(directory) as entries:
            for entry in entries:
                try:
                    if entry.is_file(follow_symlinks=False) and entry.stat().st_mtime < cutoff:
                        os.unlink(entry.path)
                except OSError:
                    continue
    except OSError:
        pass


def claim_once(kind: str, payload: tp.Dict[str, tp.Any]) -> bool:
    """True the first time a (session, turn, kind) event is seen, false after.

    Codex emits PostModelRequest per attempt (retries included), and an
    interrupted turn can race Stop with Interrupt. A small claim file keeps a
    turn from producing duplicate error/completion notifications. The state
    lives in the temp dir and is safe to lose."""
    session = str(payload.get("session_id") or "")
    turn = str(payload.get("turn_id") or "")
    if not session or not turn:
        return True

    directory = os.environ.get("NOTIFYHUB_CODEX_STATE_DIR") or os.path.join(
        tempfile.gettempdir(), "notifyhub-codex"
    )
    try:
        os.makedirs(directory, mode=0o700, exist_ok=True)
        prune_state(directory)
        digest = hashlib.sha256(f"{kind}:{session}:{turn}".encode()).hexdigest()[:32]
        path = os.path.join(directory, digest)
        fd = os.open(path, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
    except FileExistsError:
        return False
    except OSError:
        # Never lose a notification because the state dir is unavailable.
        return True
    else:
        os.close(fd)
        return True


def push(message: str, directory: tp.Optional[str], timeout: float = DEFAULT_PUSH_TIMEOUT, session_id: str = "") -> None:
    script = os.environ.get("NOTIFYHUB_PUSH_SCRIPT") or os.path.join(
        os.path.expanduser("~"), ".config", "opencode", "plugin", "notifyhub-push.py"
    )
    # The push script reports its own os.getcwd() as the notification "pwd", so
    # run it in the session's directory. Codex also runs hooks with that cwd,
    # but the payload is authoritative (and worktree-aware).
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
    """Best-effort lifecycle report to POST /api/status/codex/<state>.

    Same NOTIFYHUB_CLI_HOST/PORT/SCHEME resolution as the push CLI, honoring
    the mute rules. Failures are silent; per-event timeout discipline matches
    push() (Interrupt caps hooks at 3s, other sync hooks at 5-10s).
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
            "host": machine_label(),
            # Windows turn-start hooks use this reporter instead of curl.
            **(
                {"prompt": payload["prompt"]}
                if payload.get("hook_event_name") == "UserPromptSubmit"
                and isinstance(payload.get("prompt"), str)
                else {}
            ),
        }
    ).encode()
    request = urllib.request.Request(
        f"{scheme}://{host}:{port}/api/status/codex/{state}",
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

    if event in ("Stop", "Interrupt"):
        # A stop caused by another Stop hook continuing the turn is not a real
        # completion; the turn keeps running, so the status stays untouched.
        if event == "Stop" and payload.get("stop_hook_active"):
            return None
        return "idle"

    if event == "UserPromptSubmit":
        return "running"

    if event == "PostModelRequest":
        # Fires per model request attempt, retries included — a heartbeat
        # that also revives an entry past the stale window.
        return "running"

    if event == "PermissionRequest":
        # Only a prompt a human must answer blocks; auto_review/guardian
        # approvals keep the turn running (needs_human_permission reads the
        # transcript's turn context for that decision).
        return "blocked" if needs_human_permission(payload) else "running"

    if event == "PreToolUse":
        if payload.get("tool_name") == "request_user_input":
            return "blocked"
        return None

    return None


def main() -> None:
    try:
        payload = json.loads(sys.stdin.read() or "{}")
    except json.JSONDecodeError as error:
        print(f"NotifyHub hook: bad JSON input: {error}", file=sys.stderr)
        return
    if not isinstance(payload, dict):
        return

    if notifications_muted():
        return

    event = payload.get("hook_event_name")
    status = status_event(payload)
    if status:
        post_status(payload, status)

    message = notification_body(payload)
    if message is None:
        return

    if event in ("Stop", "Interrupt") and not claim_once("completion", payload):
        return
    if event == "PostModelRequest" and not claim_once("error", payload):
        return

    if event == "Interrupt":
        timeout = INTERRUPT_PUSH_TIMEOUT
    elif event in ("Stop", "PostModelRequest"):
        # These run synchronously: codex exec exits right after the turn, and
        # Codex cancels unfinished background hooks when the session ends.
        timeout = SYNC_PUSH_TIMEOUT
    else:
        timeout = DEFAULT_PUSH_TIMEOUT
    push(
        message,
        payload.get("cwd"),
        timeout=timeout,
        session_id=str(payload.get("session_id") or "").strip(),
    )


if __name__ == "__main__":
    main()
