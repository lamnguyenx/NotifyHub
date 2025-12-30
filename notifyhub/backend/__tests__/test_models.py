import pytest
from datetime import datetime
from notifyhub.backend.models import Notification, NotificationStore


class TestNotificationStore:
    def test_initialization(self):
        store = NotificationStore()
        assert len(store.notifications) == 0
        assert store.max_notifications == 1000
    
    def test_add_single_notification(self):
        store = NotificationStore()
        data = Notification(message="Test notification")
        notification_id = store.add(data)

        assert len(store.notifications) == 1
        n = store.notifications[0]
        assert n.message == "Test notification"
        assert n.id == notification_id
        assert isinstance(n.timestamp, str)
    
    def test_add_multiple_notifications_order(self):
        store = NotificationStore()

        # Add notifications
        id1 = store.add(Notification(message="First"))
        id2 = store.add(Notification(message="Second"))
        id3 = store.add(Notification(message="Third"))

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
            store.add(Notification(message=f"Message {i}"))

        # Should only keep the last 3 (newest)
        assert len(store.notifications) == 3
        assert store.notifications[0].message == "Message 4"
        assert store.notifications[1].message == "Message 3"
        assert store.notifications[2].message == "Message 2"
    
    def test_notification_limit_edge_case(self):
        store = NotificationStore()
        store.max_notifications = 2

        # Add exactly the limit
        store.add(Notification(message="First"))
        store.add(Notification(message="Second"))
        assert len(store.notifications) == 2

        # Add one more - should remove oldest
        store.add(Notification(message="Third"))
        assert len(store.notifications) == 2
        assert store.notifications[0].message == "Third"
        assert store.notifications[1].message == "Second"

    def test_delete_by_id_existing_notification(self):
        store = NotificationStore()

        # Add notifications
        id1 = store.add(Notification(message="First"))
        id2 = store.add(Notification(message="Second"))
        id3 = store.add(Notification(message="Third"))

        # Delete middle notification
        result = store.delete_by_id(id2)
        assert result is True
        assert len(store.notifications) == 2

        # Check remaining notifications
        assert store.notifications[0].message == "Third"
        assert store.notifications[1].message == "First"

        # Verify deleted notification is gone
        assert not any(n.id == id2 for n in store.notifications)

    def test_delete_by_id_nonexistent_notification(self):
        store = NotificationStore()

        # Add a notification
        store.add(Notification(message="Test"))

        # Try to delete non-existent ID
        result = store.delete_by_id("nonexistent-id")
        assert result is False

        # Should still have the original notification
        assert len(store.notifications) == 1

    def test_delete_by_id_empty_store(self):
        store = NotificationStore()

        # Try to delete from empty store
        result = store.delete_by_id("any-id")
        assert result is False
        assert len(store.notifications) == 0