# How OpenCode Organizes Sessions and Messages

This document describes the filesystem organization of OpenCode's local storage, based on exploration of the codebase and storage structure.

## Storage Location

OpenCode stores data locally in the XDG Base Directory standard location:
- **Base Path**: `~/.local/share/opencode/storage/` (on macOS and Linux)
- This path follows XDG_DATA_HOME, ensuring cross-platform compatibility.

## Directory Structure

The storage is organized into three main subdirectories under the base path:

### 1. Sessions (`session/`)

- **Path**: `session/{project_id}/{session_id}.json`
- **Purpose**: Stores metadata for each conversation session.
- **project_id**:
  - For Git repositories: SHA of the initial commit (`git rev-list --max-parents=0 --all`)
  - For non-Git directories: `"global"`
- **session_id**: Unique identifier for the session (e.g., `ses_469cf929cffeBICghRNeI7BWy6`)
- **Content**: JSON with session metadata (creation time, model used, etc.)
- **Example**: `~/.local/share/opencode/storage/session/a1b2c3d4/ses_123456.json`

### 2. Messages (`message/`)

- **Path**: `message/{session_id}/{message_id}.json`
- **Purpose**: Stores individual messages within a session.
- **session_id**: Links to the parent session.
- **message_id**: Unique identifier for the message (e.g., `msg_b96306d83001UHECFoapZ6W4q0`)
- **Content**: JSON with message metadata:
  - `role`: "user" or "assistant"
  - `timestamp`: Creation/modification time
  - Other metadata (but not the actual content)
- **Note**: The message JSON does not contain part IDs explicitly; linkage to parts is via the shared `message_id` in directory names.
- **Example**: `~/.local/share/opencode/storage/message/ses_123456/msg_abcdef.json`

### 3. Parts (`part/`)

- **Path**: `part/{message_id}/{part_id}.json`
- **Purpose**: Stores the actual content of messages, split into parts for efficiency.
- **message_id**: Links to the parent message.
- **part_id**: Unique identifier for the part (e.g., `prt_b96307533001LeKP6f2mBOcL16`)
- **Content**: JSON with:
  - `type`: Content type (e.g., "text", "reasoning", "tool", "step-start")
  - `text`: The actual content string
- **Why Parts?**: Messages are split into parts to handle large responses, reasoning steps, or structured content.
- **Example**: `~/.local/share/opencode/storage/part/msg_abcdef/prt_123456.json`

## Relationships

- **Session → Messages**: One session contains multiple messages (conversation history).
- **Message → Parts**: One message is composed of multiple parts (content chunks).
- **No Explicit References**: The JSON files don't contain arrays of child IDs; relationships are implicit via directory structure and shared IDs.

## File Modification Times

- Used for sorting and finding the "latest" items.
- Sessions, messages, and parts are sorted by `os.path.getmtime()` (file modification time) in descending order (newest first).

## Persistence

- All operations (creating sessions, adding messages, updating parts) write synchronously to disk as atomic JSON files.
- No manual saves; changes are persisted immediately.

## Notes

- This structure allows offline access and efficient querying without the OpenCode server.
- Project isolation via `project_id` ensures separate storage for different repos.
- The design supports incremental message building (parts added over time).