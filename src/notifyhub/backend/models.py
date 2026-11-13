from datetime import datetime, timezone
from typing import List, Optional
import uuid
import asyncio
import json
from pydantic import BaseModel, ConfigDict


def get_timeslug() -> str:
    """Get a timestamp-based slug for time-based IDs"""
    return datetime.now(timezone.utc).strftime("%Y.%m.%d__%Hh%Mm%Ss.%f")[:-3]


def get_time_uid() -> str:
    """Generate a time-based unique identifier"""
    return f"{get_timeslug()}-{str(uuid.uuid4())[:8]}"


class Notification(BaseModel):
    """Stored notification record.

    ``data`` is opaque to the store: either the plaintext payload dict
    (``{"message": ..., "pwd": ...}``) or an e2e encryption envelope
    (see :mod:`notifyhub.crypto`). Plaintext validation happens at ingest
    in the backend, not here.
    """

    model_config = ConfigDict(extra="allow")

    id: Optional[str] = None
    timestamp: Optional[str] = None
    data: dict


# Agents reporting lifecycle status via POST /api/status (mirrors herdr's
# pane.report_agent model: thin reporters, server-owned runtime facts).
STATUS_AGENTS = frozenset({"opencode", "claude", "codex"})
STATUS_STATES = frozenset({"running", "idle", "blocked"})

# Default staleness window for `running` entries whose agent died without
# an idle event (crash, terminal kill). Configurable via
# backend.agent_status_stale_seconds.
DEFAULT_STATUS_STALE_SECONDS = 300


class AgentStatus(BaseModel):
    """Last known lifecycle state of one agent session (in-memory only)."""

    model_config = ConfigDict(extra="allow")

    agent: str
    session_id: str
    state: str
    pwd: Optional[str] = None
    host: Optional[str] = None
    task: Optional[str] = None  # short excerpt of the running prompt, if known
    since: str  # ISO timestamp of the entry's first observation
    updated: str  # ISO timestamp of the last report (including refreshes)


def serialize_status(s: AgentStatus, now: datetime, stale_after: int) -> dict:
    """Serialize for REST/SSE; a `running` entry not refreshed within
    `stale_after` seconds reports state="stale" without mutating the store."""
    state = s.state
    stale = False
    if state == "running":
        try:
            age = (now - datetime.fromisoformat(s.updated)).total_seconds()
        except ValueError:
            age = 0
        stale = age > stale_after
        if stale:
            state = "stale"
    return {
        "agent": s.agent,
        "session_id": s.session_id,
        "state": state,
        "pwd": s.pwd,
        "host": s.host,
        "task": s.task,
        "since": s.since,
        "updated": s.updated,
    }


class AgentStatusStore:
    """In-memory (agent, session_id) -> AgentStatus map.

    Like NotificationStore, broadcasting is scheduled (never blocking) and
    happens only on meaningful changes (new session, state transition, or
    metadata change) — silent running-refreshes do not spam SSE clients.
    """

    def __init__(
        self,
        sse_manager=None,
        stale_after: int = DEFAULT_STATUS_STALE_SECONDS,
        entry_transform=None,
    ):
        self.statuses: "dict[tuple[str, str], AgentStatus]" = {}
        self.sse_manager = sse_manager
        self.stale_after = stale_after
        # Optional outgoing payload transform (backend uses it to wrap each
        # served/broadcast entry in an e2e envelope when a key is configured).
        self.entry_transform = entry_transform

    def update(
        self,
        agent: str,
        session_id: str,
        state: str,
        pwd: Optional[str] = None,
        host: Optional[str] = None,
        task: Optional[str] = None,
        heartbeat: bool = False,
    ) -> bool:
        """Record a report; returns True when it changed the visible state
        (and thus scheduled an SSE broadcast).

        A heartbeat (the reporters' periodic `running` refresh during long
        turns, sent with `"heartbeat": true`) is a pure liveness ping: it never
        creates an entry — the first report of a turn is always a real
        transition carrying the task excerpt — and never changes a stored
        state, so a ping racing the turn's idle/blocked report cannot
        resurrect a finished session or flip a permission wait back to
        running. On a `running` entry it just refreshes `updated` (and
        re-announces one that already went stale)."""
        key = (agent, session_id)
        now_dt = datetime.now(timezone.utc)
        now = now_dt.isoformat()
        existing = self.statuses.get(key)
        if existing is None:
            if heartbeat:
                return False
            self.statuses[key] = AgentStatus(
                agent=agent,
                session_id=session_id,
                state=state,
                pwd=pwd,
                host=host,
                task=task,
                since=now,
                updated=now,
            )
            self._broadcast(self.statuses[key])
            return True

        if heartbeat and existing.state != "running":
            return False

        # Age of the previous report, measured before it is overwritten: a
        # refresh that arrives after the stale window re-announces the entry,
        # a periodic refresh while fresh stays silent.
        try:
            refreshed_late = (
                now_dt - datetime.fromisoformat(existing.updated)
            ).total_seconds() > self.stale_after
        except ValueError:
            refreshed_late = False

        changed = (
            existing.state != state
            or (pwd is not None and existing.pwd != pwd)
            # A machine name arriving after the initial client-IP stamp should
            # reach connected clients, not wait for the next state change.
            or (host is not None and existing.host != host)
            # A new prompt on the same session (new turn) re-announces the
            # entry with its new task excerpt.
            or (task is not None and existing.task != task)
        )
        existing.state = state
        if pwd is not None:
            existing.pwd = pwd
        if host is not None:
            existing.host = host
        if task is not None:
            existing.task = task
        existing.updated = now
        if changed or refreshed_late:
            self._broadcast(existing)
        return changed or refreshed_late

    def _payload(self, entry: AgentStatus) -> dict:
        payload = serialize_status(entry, datetime.now(timezone.utc), self.stale_after)
        return self.entry_transform(payload) if self.entry_transform else payload

    def _broadcast(self, entry: AgentStatus) -> None:
        if not self.sse_manager:
            return
        event_data = {
            "event": "agent_status",
            "data": json.dumps(self._payload(entry)),
        }
        try:
            asyncio.create_task(self.sse_manager.broadcast(event_data))
        except RuntimeError:
            pass  # no running loop (tests); broadcast is best-effort

    def list_payloads(self) -> List[dict]:
        return [self._payload(s) for s in self.statuses.values()]


def serialize_notification(n: Notification) -> dict:
    """Serialize a stored record for REST/SSE (wire shape is unchanged)."""
    return {
        "id": n.id,
        "data": n.data,
        "timestamp": n.timestamp,
    }


class NotificationStore:

    def __init__(self, sse_manager=None, max_count=None):
        self.notifications: List[Notification] = []
        # None means unlimited; callers (config) supply the default cap (1000).
        self.max_notifications = max_count
        self.sse_manager = sse_manager

    def add(self, data: Notification, custom_id: Optional[str] = None) -> str:

        if custom_id:
            data.id = custom_id
        elif not data.id:
            data.id = get_time_uid()
        if not data.timestamp:
            data.timestamp = datetime.now(timezone.utc).isoformat()
        else:
            try:
                parsed = datetime.fromisoformat(data.timestamp)
                if parsed.tzinfo is None:
                    parsed = parsed.replace(tzinfo=timezone.utc)
                data.timestamp = parsed.isoformat()
            except ValueError:
                data.timestamp = datetime.now(timezone.utc).isoformat()

        self.notifications.insert(0, data)  # Newest first

        # Broadcast to SSE clients
        if self.sse_manager:
            event_data = {
                "event": "notification",
                "data": json.dumps(serialize_notification(data)),
            }
            # Schedule broadcast (don't block notification creation)
            asyncio.create_task(self.sse_manager.broadcast(event_data))

        if (
            self.max_notifications is not None
            and len(self.notifications) > self.max_notifications
        ):
            self.notifications.pop()

        return data.id

    def delete_by_id(self, notification_id: str) -> bool:
        """Delete a notification by ID. Returns True if found and deleted, False otherwise."""
        for i, notification in enumerate(self.notifications):
            if notification.id == notification_id:
                self.notifications.pop(i)
                return True
        return False

    def clear_all(self):
        """Clear all notifications"""
        self.notifications.clear()
