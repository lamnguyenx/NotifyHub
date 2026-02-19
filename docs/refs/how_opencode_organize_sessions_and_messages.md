# How OpenCode Organizes Sessions and Messages

This document describes the data organization of OpenCode's local storage.

## Overview

OpenCode stores data locally using **SQLite** (via Drizzle ORM). Previously, data was stored as individual JSON files in a directory hierarchy.

## Storage Location

- **Database Path**: `~/.local/share/opencode/opencode.db`
- **Legacy Storage**: `~/.local/share/opencode/storage/` (old JSON files, migrated automatically)
- The database follows XDG Base Directory standards for cross-platform compatibility.

## Database Schema

The SQLite database contains the following tables:

### 1. Project Table (`project`)

- **Purpose**: Stores project metadata
- **Key Fields**:
  - `id`: Project identifier (SHA of initial commit for Git repos, or custom ID)
  - `worktree`: Working directory path
  - `vcs`: Version control system info
  - `name`: Project name
  - `icon_url`, `icon_color`: Project icon
  - `sandboxes`, `commands`: Configuration
  - `time_created`, `time_updated`, `time_initialized`: Timestamps

### 2. Session Table (`session`)

- **Purpose**: Stores conversation session metadata
- **Key Fields**:
  - `id`: Unique session ID (e.g., `ses_469cf929cffeBICghRNeI7BWy6`)
  - `project_id`: Reference to parent project
  - `parent_id`: For threaded sessions
  - `slug`, `directory`, `title`: Session identifiers
  - `version`: Schema version
  - `share_url`: Public share link
  - `summary_*`: Summary statistics (additions, deletions, files, diffs)
  - `revert`: Revert state info
  - `permission`: Permission rules
  - `time_created`, `time_updated`, `time_compacting`, `time_archived`: Timestamps

### 3. Message Table (`message`)

- **Purpose**: Stores individual messages within a session
- **Key Fields**:
  - `id`: Unique message ID (e.g., `msg_b96306d83001UHECFoapZ6W4q0`)
  - `session_id`: Reference to parent session
  - `data`: JSON blob containing message info (role, timestamp, etc.)
  - `time_created`, `time_updated`: Timestamps

### 4. Part Table (`part`)

- **Purpose**: Stores message content split into parts for efficiency
- **Key Fields**:
  - `id`: Unique part ID (e.g., `prt_b96307533001LeKP6f2mBOcL16`)
  - `message_id`: Reference to parent message
  - `session_id`: Reference to session (for efficient querying)
  - `data`: JSON blob containing part content (type: "text", "reasoning", "tool", "step-start", etc.)
  - `time_created`, `time_updated`: Timestamps

### 5. Todo Table (`todo`)

- **Purpose**: Stores todo items per session
- **Key Fields**:
  - `session_id`: Reference to session
  - `content`, `status`, `priority`: Todo data
  - `position`: Ordering within session
  - Primary key: composite of `(session_id, position)`

### 6. Permission Table (`permission`)

- **Purpose**: Stores project-level permissions
- **Key Fields**:
  - `project_id`: Reference to project
  - `data`: JSON blob with permission ruleset

### 7. Session Share Table (`session_share`)

- **Purpose**: Stores session sharing metadata
- **Key Fields**:
  - `session_id`: Reference to session
  - `id`, `secret`, `url`: Share credentials

## Database Migration

### Automatic Migration

When you first run an updated version of OpenCode:

1. It checks if `~/.local/share/opencode/opencode.db` exists
2. If not, it performs a **one-time migration** from legacy JSON files
3. You see: "Performing one time database migration, may take a few minutes..."
4. Progress bar shows migration status
5. After completion: "Database migration complete."

The migration:
- Reads all JSON files from `storage/` directory
- Imports projects, sessions, messages, parts, todos, permissions, and shares
- Skips orphaned records (sessions without valid projects, etc.)
- Preserves all IDs and timestamps

### Manual Migration

You can also manually migrate using:
```bash
opencode db migrate
```

This merges JSON data with existing SQLite data (useful if you have old backups).

## Database Commands

OpenCode provides database inspection tools:

```bash
# Open interactive SQLite shell
opencode db

# Run a specific query
opencode db "SELECT * FROM session LIMIT 10"

# Get database path
opencode db path

# Migrate JSON to SQLite manually
opencode db migrate
```

## Relationships

- **Project → Sessions**: One project has multiple sessions (cascade delete)
- **Session → Messages**: One session has multiple messages (cascade delete)
- **Message → Parts**: One message has multiple parts (cascade delete)
- **Session → Todos**: One session has multiple todos (cascade delete)
- Foreign keys are enforced with `ON DELETE CASCADE`

## Persistence

- All writes go through SQLite with WAL (Write-Ahead Logging) mode
- Transactions ensure data consistency
- Parts are written incrementally during streaming responses
- Database uses PRAGMA settings for performance:
  - `journal_mode = WAL`
  - `synchronous = NORMAL`
  - `busy_timeout = 5000`
  - `cache_size = -64000` (64MB)
  - `foreign_keys = ON`

## Exporting Data

```bash
# Export session data (including messages and parts)
opencode export [sessionID]
```

This queries the SQLite database and outputs structured JSON.

## Legacy JSON Structure (Pre-SQLite)

Prior to the SQLite migration, data was stored as:
- `storage/project/{project_id}.json`
- `storage/session/{project_id}/{session_id}.json`
- `storage/message/{session_id}/{message_id}.json`
- `storage/part/{message_id}/{part_id}.json`
- `storage/todo/{session_id}.json`
- `storage/permission/{project_id}.json`
- `storage/session_share/{session_id}.json`

These files are no longer used after migration but are preserved for safety.

## Notes

- SQLite enables efficient querying without external server
- WAL mode allows concurrent reads during writes
- Project isolation ensures separate storage for different repos
- The design supports incremental message building
- All timestamps are stored as Unix milliseconds
