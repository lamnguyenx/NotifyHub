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

class NotificationData(BaseModel):
    model_config = ConfigDict(extra='allow')

    message: str
    pwd: Optional[str] = None

class Notification:
    def __init__(self, data: NotificationData, custom_id: Optional[str] = None):
        self.id = custom_id if custom_id is not None else get_time_uid()
        self.data = data.model_dump(exclude_none=True)
        self.timestamp = datetime.now()

class NotificationStore:
    def __init__(self, sse_manager=None):
        self.notifications: List[Notification] = []
        self.max_notifications = 1000
        self.sse_manager = sse_manager

    def add(self, data: NotificationData, custom_id: Optional[str] = None) -> str:
        notification = Notification(data, custom_id)
        self.notifications.insert(0, notification)  # Newest first

        # Broadcast to SSE clients
        if self.sse_manager:
            event_data = {
                "event": "notification",
                "data": json.dumps({
                    "id": notification.id,
                    "data": notification.data,
                    "timestamp": notification.timestamp.isoformat()
                })
            }
            # Schedule broadcast (don't block notification creation)
            asyncio.create_task(self.sse_manager.broadcast(event_data))

        if len(self.notifications) > self.max_notifications:
            self.notifications.pop()

        return notification.id

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