from datetime import datetime
from typing import List, Optional
import uuid
import asyncio
import json

class Notification:
    def __init__(self, message: str):
        self.id = str(uuid.uuid4())
        self.message = message
        self.timestamp = datetime.now()

class NotificationStore:
    def __init__(self, sse_manager=None):
        self.notifications: List[Notification] = []
        self.max_notifications = 1000
        self.sse_manager = sse_manager

    def add(self, message: str) -> str:
        notification = Notification(message)
        self.notifications.insert(0, notification)  # Newest first

        # Broadcast to SSE clients
        if self.sse_manager:
            event_data = {
                "event": "notification",
                "data": json.dumps({
                    "id": notification.id,
                    "message": notification.message,
                    "timestamp": notification.timestamp.isoformat()
                })
            }
            # Schedule broadcast (don't block notification creation)
            asyncio.create_task(self.sse_manager.broadcast(event_data))

        if len(self.notifications) > self.max_notifications:
            self.notifications.pop()

        return notification.id

    def clear_all(self):
        """Clear all notifications"""
        self.notifications.clear()