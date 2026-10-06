import pytest
from notifyhub.backend.models import Notification, NotificationStore


def noti(message: str) -> Notification:
    """Helper matching the new record shape: opaque `data` dict."""
    return Notification(data={"message": message})


class TestNotificationStore:

    def test_initialization(self):
        store = NotificationStore()
        assert len(store.notifications) == 0
        # None = unlimited; callers (backend config) supply the default cap.
        assert store.max_notifications is None

    def test_add_single_notification(self):
        store = NotificationStore()
        notification_id = store.add(noti("Test notification"))

        assert len(store.notifications) == 1
        n = store.notifications[0]
        assert n.data["message"] == "Test notification"
        assert n.id == notification_id
        assert isinstance(n.timestamp, str)

    def test_add_multiple_notifications_order(self):

        store = NotificationStore()

        # Add notifications
        id1 = store.add(noti("First"))
        id2 = store.add(noti("Second"))
        id3 = store.add(noti("Third"))

        # Should be in reverse chronological order (newest first)
        assert len(store.notifications) == 3
        assert store.notifications[0].data["message"] == "Third"
        assert store.notifications[1].data["message"] == "Second"
        assert store.notifications[2].data["message"] == "First"

        # Check IDs are preserved
        assert store.notifications[0].id == id3
        assert store.notifications[1].id == id2
        assert store.notifications[2].id == id1

    def test_max_notifications_limit(self):
        store = NotificationStore()
        store.max_notifications = 3

        # Add more notifications than the limit
        for i in range(5):
            store.add(noti(f"Message {i}"))

        # Should only keep the last 3 (newest)
        assert len(store.notifications) == 3
        assert store.notifications[0].data["message"] == "Message 4"
        assert store.notifications[1].data["message"] == "Message 3"
        assert store.notifications[2].data["message"] == "Message 2"

    def test_notification_limit_edge_case(self):
        store = NotificationStore()
        store.max_notifications = 2

        # Add exactly the limit
        store.add(noti("First"))
        store.add(noti("Second"))
        assert len(store.notifications) == 2

        # Add one more - should remove oldest
        store.add(noti("Third"))
        assert len(store.notifications) == 2
        assert store.notifications[0].data["message"] == "Third"
        assert store.notifications[1].data["message"] == "Second"

    def test_delete_by_id_existing_notification(self):

        store = NotificationStore()

        # Add notifications
        id1 = store.add(noti("First"))
        id2 = store.add(noti("Second"))
        store.add(noti("Third"))

        # Delete middle notification
        result = store.delete_by_id(id2)
        assert result is True
        assert len(store.notifications) == 2

        # Check remaining notifications
        assert store.notifications[0].data["message"] == "Third"
        assert store.notifications[1].data["message"] == "First"

        # Verify deleted notification is gone
        assert not any(n.id == id2 for n in store.notifications)

    def test_delete_by_id_nonexistent_notification(self):
        store = NotificationStore()

        # Add a notification
        store.add(noti("Test"))

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

    def test_data_stays_opaque(self):
        """The store must not care whether `data` is plaintext or an envelope."""
        from notifyhub.crypto import encrypt_payload

        key = bytes(range(32))
        envelope = encrypt_payload({"message": "secret"}, key)
        store = NotificationStore()

        store.add(Notification(id="enc-1", data=envelope))
        store.add(Notification(id="plain-1", data={"message": "plain"}))

        assert store.notifications[0].data == {"message": "plain"}
        assert store.notifications[1].data == envelope

    def test_serialize_notification_wire_shape(self):
        from notifyhub.backend.models import serialize_notification

        env = {"e2e": 1, "alg": "A256GCM", "kid": "abcd1234", "iv": "aXY=", "ct": "Y3Q="}
        store = NotificationStore()
        store.add(Notification(id="enc-1", data=env))

        wire = serialize_notification(store.notifications[0])
        assert wire == {"id": "enc-1", "data": env, "timestamp": store.notifications[0].timestamp}
