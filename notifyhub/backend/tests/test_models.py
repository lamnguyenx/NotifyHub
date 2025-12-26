import pytest
from datetime import datetime
from notifyhub.backend.models import Notification, NotificationStore


class TestNotification:
    def test_notification_creation(self):
        message = "Test message"
        notification = Notification(message)
        
        assert notification.message == message
        assert isinstance(notification.id, str)
        assert len(notification.id) > 0
        assert isinstance(notification.timestamp, datetime)


class TestNotificationStore:
    def test_initialization(self):
        store = NotificationStore()
        assert len(store.notifications) == 0
        assert store.max_notifications == 1000
    
    def test_add_single_notification(self):
        store = NotificationStore()
        message = "Test notification"
        notification_id = store.add(message)
        
        assert len(store.notifications) == 1
        assert store.notifications[0].message == message
        assert store.notifications[0].id == notification_id
        assert isinstance(store.notifications[0].timestamp, datetime)
    
    def test_add_multiple_notifications_order(self):
        store = NotificationStore()
        
        # Add notifications
        id1 = store.add("First")
        id2 = store.add("Second")
        id3 = store.add("Third")
        
        # Should be in reverse chronological order (newest first)
        assert len(store.notifications) == 3
        assert store.notifications[0].message == "Third"
        assert store.notifications[1].message == "Second"
        assert store.notifications[2].message == "First"
        
        # Check IDs are preserved
        assert store.notifications[0].id == id3
        assert store.notifications[1].id == id2
        assert store.notifications[2].id == id1
    
    def test_max_notifications_limit(self):
        store = NotificationStore()
        store.max_notifications = 3
        
        # Add more notifications than the limit
        for i in range(5):
            store.add(f"Message {i}")
        
        # Should only keep the last 3 (newest)
        assert len(store.notifications) == 3
        assert store.notifications[0].message == "Message 4"
        assert store.notifications[1].message == "Message 3"
        assert store.notifications[2].message == "Message 2"
    
    def test_notification_limit_edge_case(self):
        store = NotificationStore()
        store.max_notifications = 2
        
        # Add exactly the limit
        store.add("First")
        store.add("Second")
        assert len(store.notifications) == 2
        
        # Add one more - should remove oldest
        store.add("Third")
        assert len(store.notifications) == 2
        assert store.notifications[0].message == "Third"
        assert store.notifications[1].message == "Second"