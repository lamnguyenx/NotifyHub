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
