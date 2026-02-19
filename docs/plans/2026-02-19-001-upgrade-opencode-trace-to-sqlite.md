# Upgrade opencode-trace.py to SQLite

**Date**: 2026-02-19  
**Status**: 📝 PLANNED  
**Target File**: `src/notifyhub/plugins/opencode/opencode-trace.py`

## Overview

Migrate `opencode-trace.py` from JSON file-based storage to SQLite database. OpenCode has migrated its storage format from individual JSON files to SQLite (`~/.local/share/opencode/opencode.db`). This script needs to be updated to query the database directly.

## Current State

The script currently reads from:
- `~/.local/share/opencode/storage/session/{project_id}/{session_id}.json`
- `~/.local/share/opencode/storage/message/{session_id}/{message_id}.json`
- `~/.local/share/opencode/storage/part/{message_id}/{part_id}.json`

## Target State

Query SQLite database at `~/.local/share/opencode/opencode.db` with tables:
- `project` - project metadata
- `session` - session metadata
- `message` - messages with JSON data column
- `part` - message parts with JSON data column

## Implementation Plan

### 1. Dependencies

**Add**:
```python
import sqlite3
```

**Remove**:
```python
import glob  # No longer needed
```

**Keep**:
```python
import json  # Still needed for parsing data columns
import os
import subprocess
import argparse
import typing as tp
import yaml
from mini_logger import getLogger
```

### 2. Constants

**Replace**:
```python
storage_base = os.path.expanduser("~/.local/share/opencode/storage")
```

**With**:
```python
DB_PATH = os.path.expanduser("~/.local/share/opencode/opencode.db")
```

### 3. Database Helper

**Add** new function:
```python
def get_db() -> sqlite3.Connection:
    """Get SQLite connection with row factory."""
    if not os.path.exists(DB_PATH):
        raise FileNotFoundError(f"OpenCode database not found at {DB_PATH}")
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn
```

### 4. Function Rewrites

#### 4.1 `list_sessions()`

**Current**: Scans `storage/session/{project_id}/*.json` files

**New**: Query database
```sql
SELECT id, directory, time_created, time_updated
FROM session
WHERE project_id = ?
ORDER BY time_created ASC
```

**Changes**:
- Remove file globbing and `os.path.getmtime()`
- Use `time_created` from database
- Return same output format

#### 4.2 `list_messages()`

**Current**: 
1. Scan `storage/session/{project_id}/*.json` for sessions
2. For each session, scan `storage/message/{session_id}/*.json`
3. For each message, scan `storage/part/{message_id}/*.json`

**New**: Query database with joins
```sql
-- Get sessions for project
SELECT id FROM session WHERE project_id = ?

-- For each session, get messages with parts
SELECT 
    m.id as msg_id,
    m.session_id,
    m.time_created,
    m.data as msg_data,
    json_extract(m.data, '$.role') as role
FROM message m
WHERE m.session_id = ?
ORDER BY m.time_created ASC

-- For each message, get parts
SELECT 
    id,
    data as part_data,
    json_extract(data, '$.type') as part_type
FROM part
WHERE message_id = ?
ORDER BY time_created ASC
```

**Changes**:
- Use JSON extraction for `role` and `type` fields
- Remove all file operations

#### 4.3 `find_session_across_projects()`

**Current**: Glob across `storage/session/*/{session_id}.json`

**New**: Simple query
```sql
SELECT s.id, s.project_id, p.id as project_exists
FROM session s
JOIN project p ON s.project_id = p.id
WHERE s.id = ?
```

**Changes**: 
- Return tuple of `(session_id, project_id)` or `None`
- Remove file existence checks

#### 4.4 `retrieve_message()`

**Current**: Complex file scanning with mtime sorting

**New**: Query with CTE for latest pair
```sql
WITH recent_messages AS (
    SELECT 
        m.id,
        m.session_id,
        m.time_created,
        m.data,
        json_extract(m.data, '$.role') as role
    FROM message m
    JOIN session s ON m.session_id = s.id
    WHERE s.project_id = ?
      AND (? IS NULL OR m.session_id = ?)
    ORDER BY m.time_created DESC
)
SELECT * FROM recent_messages
LIMIT 50  -- Get enough to find user+assistant pair
```

Then filter in Python for the latest user and assistant messages.

**Part retrieval**:
```sql
SELECT 
    id,
    data,
    json_extract(data, '$.type') as part_type,
    json_extract(data, '$.text') as part_text
FROM part
WHERE message_id = ?
ORDER BY time_created ASC
```

**Changes**:
- No file mtime sorting - use `time_created` column
- Extract parts via SQL query instead of file glob

### 5. Data Structure Changes

#### Message Data Parsing

**Current**:
```python
with open(msg_file, 'r') as f:
    msg_data = json.load(f)
role = msg_data.get("role")
```

**New**:
```python
# From SQL query
role = row['role']  # Already extracted via json_extract()
# OR
msg_data = json.loads(row['data'])
role = msg_data.get('role')
```

#### Part Data Parsing

**Current**:
```python
with open(part_file, 'r') as f:
    data = json.load(f)
part_type = data.get("type")
text = data.get("text")
```

**New**:
```python
# From SQL query
part_type = row['part_type']
text = json.loads(row['data']).get('text')
```

### 6. Functions to Keep Unchanged

- `get_project_id()` - Still needed to get project ID from git
- `process_message_texts()` - Logic remains same, only input source changes
- `print_message()` - No changes needed
- `main()` - CLI parsing and flow unchanged

### 7. Error Handling

**Add checks for**:
1. Database file not found → Clear error message
2. No sessions for project → Same behavior as current
3. No messages in session → Same behavior as current
4. SQLite errors → Wrap in friendly error messages

### 8. Testing Checklist

- [ ] `opencode-trace.py /path/to/repo` - Retrieves latest user+assistant messages
- [ ] `opencode-trace.py /path/to/repo --list-sessions` - Lists all sessions sorted by time
- [ ] `opencode-trace.py /path/to/repo --list-messages` - Lists all messages with parts
- [ ] `opencode-trace.py /path/to/repo --session-id XXX` - Specific session retrieval
- [ ] `opencode-trace.py /path/to/repo --notifyhub` - NotifyHub mode with truncation
- [ ] `opencode-trace.py /path/to/repo --max-lines 5 --max-chars 200` - Truncation options
- [ ] Error case: Non-existent database
- [ ] Error case: Project with no sessions
- [ ] Error case: Session with no messages

### 9. Migration Notes

**No backward compatibility needed** - As per requirements:
- Remove JSON fallback entirely
- No `--use-json` flag
- Script will only work with SQLite database

**Prerequisites**:
- User must have OpenCode version with SQLite support
- Database must exist at `~/.local/share/opencode/opencode.db`
- If user hasn't opened OpenCode since the update, they need to run it once to trigger migration

## SQL Query Reference

### Database Schema (from OpenCode source)

**session table**:
```sql
CREATE TABLE session (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES project(id) ON DELETE CASCADE,
    parent_id TEXT,
    slug TEXT NOT NULL,
    directory TEXT NOT NULL,
    title TEXT NOT NULL,
    version TEXT NOT NULL,
    share_url TEXT,
    summary_additions INTEGER,
    summary_deletions INTEGER,
    summary_files INTEGER,
    summary_diffs TEXT,  -- JSON
    revert TEXT,         -- JSON
    permission TEXT,     -- JSON
    time_created INTEGER NOT NULL,
    time_updated INTEGER NOT NULL,
    time_compacting INTEGER,
    time_archived INTEGER
);
CREATE INDEX session_project_idx ON session(project_id);
CREATE INDEX session_parent_idx ON session(parent_id);
```

**message table**:
```sql
CREATE TABLE message (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL REFERENCES session(id) ON DELETE CASCADE,
    time_created INTEGER NOT NULL,
    time_updated INTEGER NOT NULL,
    data TEXT NOT NULL  -- JSON: {role, ...}
);
CREATE INDEX message_session_idx ON message(session_id);
```

**part table**:
```sql
CREATE TABLE part (
    id TEXT PRIMARY KEY,
    message_id TEXT NOT NULL REFERENCES message(id) ON DELETE CASCADE,
    session_id TEXT NOT NULL,
    time_created INTEGER NOT NULL,
    time_updated INTEGER NOT NULL,
    data TEXT NOT NULL  -- JSON: {type, text, ...}
);
CREATE INDEX part_message_idx ON part(message_id);
CREATE INDEX part_session_idx ON part(session_id);
```

**project table**:
```sql
CREATE TABLE project (
    id TEXT PRIMARY KEY,
    worktree TEXT NOT NULL,
    vcs TEXT,
    name TEXT,
    icon_url TEXT,
    icon_color TEXT,
    time_created INTEGER NOT NULL,
    time_updated INTEGER NOT NULL,
    time_initialized INTEGER,
    sandboxes TEXT,  -- JSON
    commands TEXT    -- JSON
);
```

## Estimated Effort

- Implementation: ~2 hours
- Testing: ~30 minutes
- Documentation: ~15 minutes

## Risks and Mitigation

| Risk | Mitigation |
|------|------------|
| Database schema changes in future OpenCode versions | Add schema version check or catch SQLite errors gracefully |
| JSON structure in `data` columns changes | Use defensive parsing with `.get()` defaults |
| Large databases causing slow queries | Add LIMIT clauses, optimize with indexes (already present) |
| Concurrent access (OpenCode writing, script reading) | Use WAL mode (already enabled by OpenCode), read-only transactions |

## Success Criteria

1. All existing CLI options work identically
2. Output format matches current YAML structure exactly
3. Performance is equal or better than file-based approach
4. No file system operations (glob, open, read) remain
5. Clear error messages when database is missing or inaccessible
