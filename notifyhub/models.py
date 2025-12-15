from datetime import datetime
from typing import List
import uuid

class Notification:
    def __init__(self, message: str):
        self.id = str(uuid.uuid4())
        self.message = message
        self.timestamp = datetime.now()

class NotificationStore:
    def __init__(self):
        self.notifications: List[Notification] = []
        self.max_notifications = 1000
    
    def add(self, message: str) -> str:
        notification = Notification(message)
        self.notifications.insert(0, notification)  # Newest first
        if len(self.notifications) > self.max_notifications:
            self.notifications.pop()
        return notification.id