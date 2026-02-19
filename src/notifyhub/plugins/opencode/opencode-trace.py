#!/usr/bin/env python3
import sys
import os
import subprocess
import sqlite3
import json
import argparse
import typing as tp
import yaml
from mini_logger import getLogger

logger = getLogger(__name__)

DB_PATH = os.path.expanduser("~/.local/share/opencode/opencode.db")


def get_db() -> sqlite3.Connection:
    """Get SQLite connection with row factory."""
    if not os.path.exists(DB_PATH):
        raise FileNotFoundError(f"OpenCode database not found at {DB_PATH}")
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


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
        commits = sorted(result.stdout.strip().split("\n"))
        if commits:
            return commits[0]
    except (subprocess.CalledProcessError, FileNotFoundError):
        pass
    return "global"


def list_sessions(
    project_id: str,
) -> None:
    conn = get_db()
    try:
        cursor = conn.execute(
            """
            SELECT id, directory, time_created
            FROM session
            WHERE project_id = ?
            ORDER BY time_created ASC
            """,
            (project_id,),
        )
        sessions = []
        home = os.path.expanduser("~")
        for row in cursor.fetchall():
            sid = row["id"]
            directory = row["directory"] or ""
            if directory.startswith(home):
                directory = "~" + directory[len(home) :]
            sessions.append((row["time_created"], f"{sid} {directory}"))

        if sessions:
            print("\n".join([item[1] for item in sessions]))
        else:
            print(f"No sessions found for project {project_id}")
    finally:
        conn.close()


def list_messages(
    project_id: str,
    session_id: tp.Optional[str] = None,
) -> None:
    conn = get_db()
    try:
        # Get sessions for this project
        if session_id:
            # Verify session exists and belongs to project
            cursor = conn.execute(
                """
                SELECT id FROM session WHERE id = ? AND project_id = ?
                """,
                (session_id, project_id),
            )
            if not cursor.fetchone():
                raise ValueError(f"Session {session_id} not found")
            session_ids = [session_id]
        else:
            cursor = conn.execute(
                """
                SELECT id FROM session WHERE project_id = ?
                """,
                (project_id,),
            )
            session_ids = [row["id"] for row in cursor.fetchall()]
            if not session_ids:
                print(f"No sessions found for project {project_id}")
                return

        sessions_data = {}
        home = os.path.expanduser("~")

        for sid in session_ids:
            sessions_data[sid] = {"max_message_time": 0, "messages": {}}

            # Get messages for this session
            cursor = conn.execute(
                """
                SELECT id, time_created, data
                FROM message
                WHERE session_id = ?
                ORDER BY time_created ASC
                """,
                (sid,),
            )

            for msg_row in cursor.fetchall():
                mid = msg_row["id"]
                msg_data = json.loads(msg_row["data"])
                role = msg_data.get("role", "unknown")
                sessions_data[sid]["max_message_time"] = max(
                    sessions_data[sid]["max_message_time"], msg_row["time_created"]
                )

                # Get parts for this message
                parts = {}
                part_cursor = conn.execute(
                    """
                    SELECT id FROM part WHERE message_id = ? ORDER BY time_created ASC
                    """,
                    (mid,),
                )
                for part_row in part_cursor.fetchall():
                    pid = part_row["id"]
                    parts[pid] = f"[db] part/{mid}/{pid}"

                sessions_data[sid]["messages"][mid] = {
                    "path": f"[db] message/{sid}/{mid}",
                    "role": role,
                    "parts": parts,
                }

        # Sort sessions by max message time (oldest first)
        sorted_sessions = sorted(
            sessions_data.items(), key=lambda x: x[1]["max_message_time"], reverse=False
        )
        output = {
            "sessions": {
                sid: {"messages": data["messages"]} for sid, data in sorted_sessions
            }
        }
        print(yaml.dump(output, default_flow_style=False, sort_keys=False))
    finally:
        conn.close()


def find_session_across_projects(
    session_id: str,
) -> tp.Optional[tp.Tuple[str, str]]:
    """Find a session across all projects. Returns (session_id, project_id) or None."""
    conn = get_db()
    try:
        cursor = conn.execute(
            """
            SELECT s.id, s.project_id
            FROM session s
            JOIN project p ON s.project_id = p.id
            WHERE s.id = ?
            """,
            (session_id,),
        )
        row = cursor.fetchone()
        if row:
            return (row["id"], row["project_id"])
        return None
    finally:
        conn.close()


def retrieve_message(
    project_id: str,
    session_id: tp.Optional[str] = None,
    max_lines: tp.Optional[int] = None,
    single_line: bool = False,
    max_chars: tp.Optional[int] = None,
    max_chars_tolerance: int = 8,
) -> tp.Tuple[str, str]:
    conn = get_db()
    try:
        # Build query to get recent messages
        if session_id:
            # Verify session exists
            cursor = conn.execute(
                """
                SELECT id FROM session WHERE id = ? AND project_id = ?
                """,
                (session_id, project_id),
            )
            if not cursor.fetchone():
                # Search across all projects
                result = find_session_across_projects(session_id)
                if not result:
                    raise ValueError(f"Session {session_id} not found")
                _, found_project_id = result
                # Re-verify with correct project
                cursor = conn.execute(
                    """
                    SELECT id FROM session WHERE id = ? AND project_id = ?
                    """,
                    (session_id, found_project_id),
                )
                if not cursor.fetchone():
                    raise ValueError(f"Session {session_id} not found")
            session_filter = "AND m.session_id = ?"
            params = (project_id, session_id)
        else:
            session_filter = ""
            params = (project_id,)

        # Get recent messages
        cursor = conn.execute(
            f"""
            SELECT 
                m.id,
                m.session_id,
                m.time_created,
                json_extract(m.data, '$.role') as role
            FROM message m
            JOIN session s ON m.session_id = s.id
            WHERE s.project_id = ? {session_filter}
            ORDER BY m.time_created DESC
            LIMIT 100
            """,
            params,
        )

        messages = cursor.fetchall()
        if not messages:
            return "", ""

        # Find latest user and assistant messages
        user_msg_id = None
        assistant_msg_id = None
        for row in messages:
            role = row["role"]
            if role == "user" and user_msg_id is None:
                user_msg_id = row["id"]
            elif role == "assistant" and assistant_msg_id is None:
                assistant_msg_id = row["id"]
            if user_msg_id is not None and assistant_msg_id is not None:
                break

        if not assistant_msg_id:
            return "", ""

        def extract_message_content(msg_id: str) -> tp.Optional[dict]:
            """Extract message content from database."""
            # Get message details
            cursor = conn.execute(
                """
                SELECT data FROM message WHERE id = ?
                """,
                (msg_id,),
            )
            row = cursor.fetchone()
            if not row:
                return None

            msg_data = json.loads(row["data"])
            role = msg_data.get("role", "unknown")

            # Get parts
            parts_dict = {}
            parts_content = []
            part_cursor = conn.execute(
                """
                SELECT 
                    id,
                    json_extract(data, '$.type') as part_type,
                    json_extract(data, '$.text') as part_text
                FROM part
                WHERE message_id = ?
                ORDER BY time_created ASC
                """,
                (msg_id,),
            )

            for part_row in part_cursor.fetchall():
                pid = part_row["id"]
                parts_dict[pid] = f"[db] part/{msg_id}/{pid}"
                part_type = part_row["part_type"]
                part_text = part_row["part_text"] or ""
                if part_type in ("text", "reasoning"):
                    parts_content.append((part_type, part_text))

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
                "path": f"[db] message/{msg_id}",
                "role": role,
                "parts_dict": parts_dict,
                "reasoning_texts": reasoning_texts,
                "text_texts": text_texts,
            }

        # Extract content for assistant message
        assistant_data = extract_message_content(assistant_msg_id)
        if not assistant_data:
            return "", ""

        # Extract user message if exists
        user_data = None
        if user_msg_id:
            user_data = extract_message_content(user_msg_id)

        # Log message details
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
            yaml.dump(
                {"messages": message_dict}, default_flow_style=False, sort_keys=False
            )
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

            original_cleaned_len = len(cleaned)
            if max_chars and len(cleaned) > max_chars:
                target_pos = len(cleaned) - max_chars
                search_start = target_pos
                search_end = min(len(cleaned), target_pos + max_chars_tolerance)
                snap_pos = None
                for i in range(search_start, search_end):
                    if cleaned[i] in " \n":
                        snap_pos = i
                        break
                if snap_pos is not None:
                    cleaned = cleaned[snap_pos + 1 :].lstrip(" \n")
                else:
                    cleaned = cleaned[-max_chars:]
            truncated_chars = max(0, original_cleaned_len - len(cleaned))
            prefix = ""
            if truncated_lines > 0:
                prefix += f"[#truncated:+{truncated_lines} LINES]"
            if truncated_chars > 0:
                prefix += f"[#truncated:+{truncated_chars} CHARS]"
            return (prefix + cleaned).strip()

        # Process user message
        logger.debug("message:")
        user_cleaned = process_message_texts(
            user_data["text_texts"] if user_data else []
        )

        # Process assistant message
        assistant_cleaned = process_message_texts(assistant_data["text_texts"])

        return user_cleaned, assistant_cleaned
    finally:
        conn.close()


def print_message(
    user_msg: str,
    assistant_msg: str,
) -> None:
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

    directory = os.path.realpath(args.directory)
    if not os.path.isdir(directory):
        print(f"Directory {directory} does not exist")
        sys.exit(1)

    # Check database exists
    if not os.path.exists(DB_PATH):
        print(f"Error: OpenCode database not found at {DB_PATH}")
        print("Please run OpenCode at least once to create the database.")
        sys.exit(1)

    project_id = get_project_id(directory=directory)

    if args.list_sessions:
        list_sessions(project_id=project_id)
    elif args.list_messages:
        list_messages(
            project_id=project_id,
            session_id=args.session_id,
        )
    else:
        user_msg, assistant_msg = retrieve_message(
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
