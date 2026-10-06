import pytest
from fastapi.testclient import TestClient
from notifyhub.backend.backend import app
from notifyhub.backend.models import NotificationStore
from notifyhub.crypto import (
    CryptoError,
    decrypt_payload,
    encrypt_payload,
    is_envelope,
    key_id,
)
import notifyhub.backend.backend as backend

# Same fixed fixture as tests/notifyhub/backend/test_crypto.py and the TUI
# bun tests (src/notifyhub/tui/src/__tests__/crypto.test.ts).
E2E_KEY = bytes(range(32))
E2E_KEY_B64 = "AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8="
E2E_KID = key_id(E2E_KEY)


def enable_e2e(monkeypatch):
    monkeypatch.setattr(backend, "_e2e_enabled", True)
    monkeypatch.setattr(backend, "_e2e_key", E2E_KEY)


@pytest.fixture(autouse=True)
def reset_store(monkeypatch):
    # Reset the global store (and e2e globals) before each test
    backend.store = NotificationStore()
    monkeypatch.setattr(backend, "_e2e_enabled", False)
    monkeypatch.setattr(backend, "_e2e_key", None)


@pytest.fixture
def client():
    return TestClient(app)


class TestNotifyAPI:

    def test_notify_post_success(self, client):
        response = client.post(
            "/api/notify", json={"data": {"message": "Test notification"}}
        )

        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert "id" in data
        assert isinstance(data["id"], str)

    def test_notify_post_empty_message(self, client):
        response = client.post("/api/notify", json={"data": {"message": ""}})

        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True

    def test_notify_post_stores_notification(self, client):
        data = {"message": "Stored notification"}
        response = client.post("/api/notify", json={"data": data})

        assert response.status_code == 200

        # Check that notification was stored
        assert len(backend.store.notifications) == 1
        assert backend.store.notifications[0].data == data

    def test_notify_post_multiple_notifications(self, client):
        # Send multiple notifications
        client.post("/api/notify", json={"data": {"message": "First"}})
        client.post("/api/notify", json={"data": {"message": "Second"}})
        client.post("/api/notify", json={"data": {"message": "Third"}})

        # Check they are stored in correct order (newest first)
        assert len(backend.store.notifications) == 3
        assert backend.store.notifications[0].data["message"] == "Third"
        assert backend.store.notifications[1].data["message"] == "Second"
        assert backend.store.notifications[2].data["message"] == "First"

    def test_notify_post_missing_message_rejected(self, client):
        response = client.post("/api/notify", json={"data": {"pwd": "/tmp"}})

        assert response.status_code == 200
        assert "error" in response.json()
        assert len(backend.store.notifications) == 0


class TestNotificationsAPI:

    def test_get_notifications_empty(self, client):
        response = client.get("/api/notifications")

        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        assert len(data) == 0

    def test_get_notifications_with_data(self, client):

        # Add some notifications
        client.post("/api/notify", json={"data": {"message": "First"}})
        client.post("/api/notify", json={"data": {"message": "Second"}})

        response = client.get("/api/notifications")

        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        assert len(data) == 2

        # Check structure
        notification = data[0]
        assert "id" in notification
        assert "data" in notification
        assert "timestamp" in notification
        assert notification["data"]["message"] == "Second"  # Newest first

    def test_get_notifications_returns_list_of_dicts(self, client):
        client.post("/api/notify", json={"data": {"message": "Test"}})

        response = client.get("/api/notifications")
        data = response.json()

        assert isinstance(data, list)
        assert isinstance(data[0], dict)
        assert all(key in data[0] for key in ["id", "data", "timestamp"])


class TestDeleteNotificationsAPI:

    def test_delete_notifications_bulk(self, client):
        # Add some notifications
        client.post("/api/notify", json={"data": {"message": "First"}})
        client.post("/api/notify", json={"data": {"message": "Second"}})

        # Delete all notifications
        response = client.delete("/api/notifications")

        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert "All notifications cleared" in data["message"]

        # Verify store is empty
        assert len(backend.store.notifications) == 0

    def test_delete_notifications_individual_existing(self, client):
        # Add a notification
        create_response = client.post("/api/notify", json={"data": {"message": "Test"}})
        notification_id = create_response.json()["id"]

        # Delete specific notification
        delete_response = client.delete(f"/api/notifications?id={notification_id}")

        assert delete_response.status_code == 200
        data = delete_response.json()
        assert data["success"] is True
        assert f"Notification {notification_id} deleted" in data["message"]

        # Verify notification is gone
        assert len(backend.store.notifications) == 0

    def test_delete_notifications_individual_nonexistent(self, client):
        # Try to delete non-existent notification
        response = client.delete("/api/notifications?id=nonexistent-id")

        assert response.status_code == 404
        data = response.json()
        assert "detail" in data
        assert data["detail"] == "Notification not found"

    def test_delete_notifications_individual_preserves_others(self, client):

        # Add multiple notifications
        client.post("/api/notify", json={"data": {"message": "First"}})
        create_response = client.post(
            "/api/notify", json={"data": {"message": "Second"}}
        )
        delete_id = create_response.json()["id"]
        client.post("/api/notify", json={"data": {"message": "Third"}})

        # Delete middle notification
        response = client.delete(f"/api/notifications?id={delete_id}")

        assert response.status_code == 200

        # Should have 2 notifications left
        assert len(backend.store.notifications) == 2

        # Verify the deleted one is gone and others remain
        remaining_messages = [n.data["message"] for n in backend.store.notifications]
        assert "Second" not in remaining_messages
        assert "First" in remaining_messages
        assert "Third" in remaining_messages


class TestRootEndpoint:

    def test_root_get_returns_html(self, client):
        response = client.get("/")

        assert response.status_code == 200
        assert "text/html" in response.headers["content-type"]
        assert "NotifyHub" in response.text

    def test_root_serves_react_app(self, client):
        response = client.get("/")

        # Should contain the React app mounting point
        assert '<div id="root"></div>' in response.text
        assert '<script type="module" src="/static/app.js"></script>' in response.text


class TestE2EEncryption:
    """e2e enabled: storage + API responses carry only envelopes."""

    def test_plaintext_inbound_stored_as_envelope(self, client, monkeypatch):
        enable_e2e(monkeypatch)
        response = client.post(
            "/api/notify", json={"data": {"message": "secret message", "pwd": "/tmp"}}
        )

        assert response.status_code == 200
        assert response.json()["success"] is True

        stored = backend.store.notifications[0].data
        assert is_envelope(stored) is True
        assert "message" not in stored
        assert decrypt_payload(stored, E2E_KEY) == {
            "message": "secret message",
            "pwd": "/tmp",
        }

    def test_get_notifications_serves_envelopes(self, client, monkeypatch):
        enable_e2e(monkeypatch)
        client.post("/api/notify", json={"data": {"message": "secret message"}})

        response = client.get("/api/notifications")
        assert response.status_code == 200

        notification = response.json()[0]
        assert is_envelope(notification["data"]) is True
        assert "message" not in notification["data"]
        assert decrypt_payload(notification["data"], E2E_KEY)["message"] == "secret message"

    def test_envelope_inbound_accepted(self, client, monkeypatch):
        enable_e2e(monkeypatch)
        envelope = encrypt_payload({"message": "from remote producer"}, E2E_KEY)

        response = client.post("/api/notify", json={"data": envelope})

        assert response.status_code == 200
        assert response.json()["success"] is True
        stored = backend.store.notifications[0].data
        assert decrypt_payload(stored, E2E_KEY) == {"message": "from remote producer"}

    def test_envelope_inbound_with_wrong_key_rejected(self, client, monkeypatch):
        enable_e2e(monkeypatch)
        envelope = encrypt_payload({"message": "wrong key"}, b"\x09" * 32)

        response = client.post("/api/notify", json={"data": envelope})

        assert response.status_code == 200
        body = response.json()
        assert "error" in body
        assert "E2E crypto error" in body["error"][0]
        assert len(backend.store.notifications) == 0

    def test_envelope_inbound_without_key_configured_rejected(self, client):
        # e2e disabled → an inbound envelope cannot be decrypted → error
        envelope = encrypt_payload({"message": "nope"}, E2E_KEY)

        response = client.post("/api/notify", json={"data": envelope})

        assert response.status_code == 200
        body = response.json()
        assert "error" in body
        assert "E2E crypto error" in body["error"][0]
        assert len(backend.store.notifications) == 0

    def test_push_integrations_see_plaintext(self, client, monkeypatch):
        """Tag matching + push (macOS toast here) must receive decrypted text."""
        enable_e2e(monkeypatch)
        sent: list = []

        def fake_macos(text="", pwd=None, sound=None):
            sent.append((text, pwd))
            return True

        monkeypatch.setattr(backend, "_macos_notifications_enabled", True)
        monkeypatch.setattr(backend, "send_macos_notification", fake_macos)

        envelope = encrypt_payload(
            {"message": "[#opencode.question] asking", "pwd": "/tmp/proj"}, E2E_KEY
        )
        client.post("/api/notify", json={"data": envelope})

        assert sent == [("[#opencode.question] asking", "/tmp/proj")]

    def test_ciphertext_page_cursor_unchanged(self, client, monkeypatch):
        """id/timestamp stay plaintext so `before=` pagination keeps working."""
        enable_e2e(monkeypatch)
        ids = [
            client.post("/api/notify", json={"data": {"message": f"m{i}"}}).json()["id"]
            for i in range(3)
        ]

        response = client.get(f"/api/notifications?limit=10&before={ids[1]}")
        page = response.json()
        assert len(page) == 1
        # ids[1] is the middle one; only the oldest (ids[0]) is strictly older.
        assert page[0]["id"] == ids[0]
        assert is_envelope(page[0]["data"])

    def test_e2e_status_endpoint(self, client, monkeypatch):
        # Disabled by default
        assert client.get("/api/e2e").json() == {"enabled": False, "alg": None, "kid": None}

        enable_e2e(monkeypatch)
        assert client.get("/api/e2e").json() == {
            "enabled": True,
            "alg": "A256GCM",
            "kid": E2E_KID,
        }
