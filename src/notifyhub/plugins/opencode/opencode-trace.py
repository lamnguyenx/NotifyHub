#!/usr/bin/env python3
import sys
import os
import subprocess
import glob
import json
import argparse
import typing as tp
import yaml
import re
from mini_logger import getLogger

logger = getLogger(__name__)


def get_project_id(directory: str) -> str:
    try:
        # Change to the directory
        os.chdir(directory)
        # Run git rev-list to get initial commit
        result = subprocess.run(
            ["git", "rev-list", "--max-parents=0", "--all"],
            capture_output=True,
            text=True,
            check=True,
        )
        commits = result.stdout.strip().split("\n")
        if commits:
            return commits[0]
    except (subprocess.CalledProcessError, FileNotFoundError):
        pass
    return "global"


def list_sessions(storage_base: str, project_id: str) -> None:
    session_dir = os.path.join(storage_base, "session", project_id)
    if not os.path.exists(session_dir):
        print(f"No sessions found for project {project_id}")
        return
    sessions = []
    home = os.path.expanduser("~")
    for f in glob.glob(os.path.join(session_dir, "*.json")):
        sid = os.path.splitext(os.path.basename(f))[0]
        path = f
        if path.startswith(home):
            path = "~" + path[len(home) :]
        mtime = os.path.getmtime(f)
        sessions.append((mtime, f"{sid} {path}"))
    if sessions:
        sessions.sort(key=lambda x: x[0], reverse=False)
        print("\n".join([item[1] for item in sessions]))


def list_messages(
    storage_base: str,
    project_id: str,
    session_id: tp.Optional[str] = None,
) -> None:
    if session_id:
        session_file = os.path.join(
            storage_base, "session", project_id, f"{session_id}.json"
        )
        if not os.path.exists(session_file):
            raise ValueError(f"Session {session_id} not found")
    sessions_to_check = [session_id] if session_id else []
    if not sessions_to_check:
        session_dir = os.path.join(storage_base, "session", project_id)
        if not os.path.exists(session_dir):
            print(f"No sessions found for project {project_id}")
            return
        sessions_to_check = [
            os.path.splitext(os.path.basename(f))[0]
            for f in glob.glob(os.path.join(session_dir, "*.json"))
        ]
    sessions_data = {}
    home = os.path.expanduser("~")
    for sid in sessions_to_check:
        sessions_data[sid] = {"max_message_mtime": 0, "messages": {}}
        message_dir = os.path.join(storage_base, "message", sid)
        if os.path.exists(message_dir):
            messages = []
            for f in glob.glob(os.path.join(message_dir, "*.json")):
                mid = os.path.splitext(os.path.basename(f))[0]
                path = f
                if path.startswith(home):
                    path = "~" + path[len(home) :]
                mtime = os.path.getmtime(f)
                sessions_data[sid]["max_message_mtime"] = max(
                    sessions_data[sid]["max_message_mtime"], mtime
                )
                with open(f, mode="r") as mf:
                    msg_data = json.load(mf)
                    role = msg_data.get("role", "unknown")
                parts = {}
                part_dir = os.path.join(storage_base, "part", mid)
                if os.path.exists(part_dir):
                    for pf in glob.glob(os.path.join(part_dir, "*.json")):
                        pid = os.path.splitext(os.path.basename(pf))[0]
                        ppath = pf
                        if ppath.startswith(home):
                            ppath = "~" + ppath[len(home) :]
                        parts[pid] = ppath
                messages.append((mtime, mid, path, role, parts))
            messages.sort(key=lambda x: x[0], reverse=False)
            for mtime, mid, path, role, parts in messages:
                sessions_data[sid]["messages"][mid] = {
                    "path": path,
                    "role": role,
                    "parts": parts,
                }
    # Sort sessions by max message mtime (oldest first, like ls -ltr)
    sorted_sessions = sorted(
        sessions_data.items(), key=lambda x: x[1]["max_message_mtime"], reverse=False
    )
    output = {
        "sessions": {
            sid: {"messages": data["messages"]} for sid, data in sorted_sessions
        }
    }
    print(yaml.dump(output, default_flow_style=False, sort_keys=False))


def retrieve_message(
    storage_base: str,
    project_id: str,
    session_id: tp.Optional[str] = None,
    max_lines: tp.Optional[int] = None,
    single_line: bool = False,
    max_chars: tp.Optional[int] = None,
    max_chars_tolerance: int = 8,
) -> tp.Tuple[str, str]:
    session_dir = os.path.join(storage_base, "session", project_id)

    if session_id:
        session_file = os.path.join(session_dir, f"{session_id}.json")
        if not os.path.exists(session_file):
            raise ValueError(f"Session {session_id} not found")
    else:
        if not os.path.exists(session_dir):
            return "", ""
        session_id = None  # Will scan all sessions

    # Find the latest assistant message
    assistant_messages = []
    sessions_to_check = [session_id] if session_id else []
    if not session_id:
        for session_file in glob.glob(os.path.join(session_dir, "*.json")):
            sessions_to_check.append(
                os.path.splitext(os.path.basename(session_file))[0]
            )

    for sid in sessions_to_check:
        message_dir = os.path.join(storage_base, "message", sid)
        if os.path.exists(message_dir):
            for msg_file in glob.glob(os.path.join(message_dir, "*.json")):
                with open(msg_file, mode="r") as f:
                    data = json.load(f)
                    if data.get("role") == "assistant":
                        mtime = os.path.getmtime(msg_file)
                        assistant_messages.append((mtime, msg_file))

    if not assistant_messages:
        return "", ""

    # Sort by mtime descending
    assistant_messages.sort(key=lambda x: x[0], reverse=True)
    latest_msg = assistant_messages[0][1]

    # Find the preceding user message in the same session
    message_dir = os.path.dirname(latest_msg)
    msg_files = sorted(
        glob.glob(os.path.join(message_dir, "*.json")), key=os.path.getmtime
    )
    user_msg = None
    latest_basename = os.path.basename(latest_msg)
    for msg_file in reversed(msg_files):
        if os.path.basename(msg_file) == latest_basename:
            continue
        with open(msg_file, mode="r") as f:
            data = json.load(f)
            if data.get("role") == "user":
                user_msg = msg_file
                break

    # Function to extract message content and parts
    def extract_message_content(msg_file):
        msg_id = os.path.splitext(os.path.basename(msg_file))[0]
        with open(msg_file, mode="r") as f:
            msg_data = json.load(f)
            role = msg_data.get("role", "unknown")
        path = msg_file
        home = os.path.expanduser("~")
        if path.startswith(home):
            path = "~" + path[len(home) :]
        part_dir = os.path.join(storage_base, "part", msg_id)
        parts_dict = {}
        parts_content = []
        if os.path.exists(part_dir):
            for part_file in glob.glob(os.path.join(part_dir, "*.json")):
                with open(part_file, mode="r") as f:
                    data = json.load(f)
                    part_type = data.get("type")
                    pid = os.path.splitext(os.path.basename(part_file))[0]
                    ppath = part_file
                    if ppath.startswith(home):
                        ppath = "~" + ppath[len(home) :]
                    parts_dict[pid] = ppath
                    if part_type in ("text", "reasoning"):
                        parts_content.append((part_type, data.get("text", "")))
        # Sort parts: reasoning first, then text
        type_order = {"reasoning": 0, "text": 1}
        parts_content.sort(key=lambda x: type_order.get(x[0], 99))
        reasoning_texts = []
        text_texts = []
        for part_type, text in parts_content:
            if part_type == "reasoning":
                reasoning_texts.append(text)
            elif part_type == "text":
                text_texts.append(text)
        return {
            "msg_id": msg_id,
            "path": path,
            "role": role,
            "parts_dict": parts_dict,
            "reasoning_texts": reasoning_texts,
            "text_texts": text_texts,
        }

    # Extract content for assistant message
    assistant_data = extract_message_content(latest_msg)

    # Find and extract user message if exists
    user_data = None
    if user_msg:
        user_data = extract_message_content(user_msg)

    # Log the message details
    message_dict = {
        assistant_data["msg_id"]: {
            "path": assistant_data["path"],
            "role": assistant_data["role"],
            "parts": assistant_data["parts_dict"],
        }
    }
    if user_data:
        message_dict[user_data["msg_id"]] = {
            "path": user_data["path"],
            "role": user_data["role"],
            "parts": user_data["parts_dict"],
        }
    logger.debug(
        yaml.dump({"messages": message_dict}, default_flow_style=False, sort_keys=False)
    )

    # Function to process message texts
    def process_message_texts(text_texts):
        if not text_texts:
            return ""
        joined = "\n".join(text_texts)
        lines = joined.split("\n")
        original_lines = len(lines)
        if max_lines:
            lines = lines[-max_lines:]
        truncated_lines = max(0, original_lines - len(lines))
        cleaned = "\n".join(lines).rstrip("\n")
        if single_line:
            cleaned = cleaned.replace("\n", "\\n")
        # cleaned = re.sub(
        #     r"(\\n)+",
        #     lambda m: f"[#truncated:↵ × {len(m.group(0)) // 2}]",
        #     cleaned,
        # )

        original_cleaned_len = len(cleaned)
        if max_chars and len(cleaned) > max_chars:
            target_pos = max_chars
            search_start = target_pos
            search_end = min(len(cleaned), target_pos + max_chars_tolerance)
            snap_pos = None
            for i in range(search_start, search_end):
                if cleaned[i] in " \n":
                    snap_pos = i
                    break
            if snap_pos is not None:
                cleaned = cleaned[: snap_pos + 1].rstrip(" \n")
            else:
                cleaned = cleaned[:target_pos]
        truncated_chars = max(0, original_cleaned_len - len(cleaned))
        prefix = ""
        if truncated_lines > 0:
            prefix += f"[#truncated:+{truncated_lines} LINES]"
        if truncated_chars > 0:
            prefix += f"[#truncated:+{truncated_chars} CHARS]"
        return (prefix + cleaned).strip()

    # Process user message
    logger.debug("message:")
    user_cleaned = process_message_texts(user_data["text_texts"] if user_data else [])

    # Process assistant message
    assistant_cleaned = process_message_texts(assistant_data["text_texts"])

    return user_cleaned, assistant_cleaned


def print_message(user_msg: str, assistant_msg: str) -> None:
    print("[#tag:@USER]", user_msg)
    print("[#tag:@ASSISTANT]", assistant_msg)


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Retrieve latest assistant message or list sessions for a directory."
    )
    parser.add_argument("directory", help="Path to the project directory")
    parser.add_argument(
        "--session-id", help="Specific session ID to retrieve from (optional)"
    )
    parser.add_argument(
        "--list-sessions",
        action="store_true",
        help="List all sessions for the directory and exit",
    )
    parser.add_argument(
        "--list-messages",
        action="store_true",
        help="List all messages for the directory or session and exit",
    )
    parser.add_argument(
        "--max-lines",
        "-n",
        type=int,
        help="Limit output to the last N lines of user and assistant text",
    )
    parser.add_argument(
        "--single-line",
        "-s",
        action="store_true",
        help="Output text as a single line with newlines escaped",
    )
    parser.add_argument(
        "--max-chars",
        "-c",
        type=int,
        help="Limit output to the last N characters",
    )
    parser.add_argument(
        "--max-chars-tolerance",
        type=int,
        default=8,
        help="Tolerance for auto-snapping --max-chars truncation to nearest space or newline (default: 8)",
    )
    parser.add_argument(
        "--notifyhub",
        action="store_true",
        help="Shortcut for notifyhub",
    )
    args = parser.parse_args()

    if args.notifyhub:
        args.max_lines = 5
        args.max_chars = 200
        # args.single_line = True

    directory = os.path.realpath(args.directory)
    if not os.path.isdir(directory):
        print(f"Directory {directory} does not exist")
        sys.exit(1)

    storage_base = os.path.expanduser("~/.local/share/opencode/storage")
    project_id = get_project_id(directory=directory)

    if args.list_sessions:
        list_sessions(storage_base=storage_base, project_id=project_id)
    elif args.list_messages:
        list_messages(
            storage_base=storage_base,
            project_id=project_id,
            session_id=args.session_id,
        )
    else:
        user_msg, assistant_msg = retrieve_message(
            storage_base=storage_base,
            project_id=project_id,
            session_id=args.session_id,
            max_lines=args.max_lines,
            single_line=args.single_line,
            max_chars=args.max_chars,
            max_chars_tolerance=args.max_chars_tolerance,
        )
        print_message(user_msg=user_msg, assistant_msg=assistant_msg)


if __name__ == "__main__":
    main()
