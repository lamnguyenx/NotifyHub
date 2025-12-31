from datetime import datetime, timezone
from typing import List, Optional
import uuid
import asyncio
import json
from pydantic import BaseModel, ConfigDict


def get_timeslug() -> str:
    """Get a timestamp-based slug for time-based IDs"""
    return datetime.now(timezone.utc).strftime('%Y.%m.%d__%Hh%Mm%Ss.%f')[:-3]


def get_time_uid() -> str:
    """Generate a time-based unique identifier"""
    return f"{get_timeslug()}-{str(uuid.uuid4())[:8]}"

class Notification(BaseModel):
    model_config = ConfigDict(extra='allow')

    id: Optional[str] = None
    message: str
    pwd: Optional[str] = None
    timestamp: Optional[str] = None

class NotificationStore:
    def __init__(self, sse_manager=None):
        self.notifications: List[Notification] = []
        self.max_notifications = 1000
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
                "data": json.dumps({
                    "id": data.id,
                    "data": data.model_dump(exclude={'id', 'timestamp'}),
                    "timestamp": data.timestamp
                })
            }
            # Schedule broadcast (don't block notification creation)
            asyncio.create_task(self.sse_manager.broadcast(event_data))

        if len(self.notifications) > self.max_notifications:
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