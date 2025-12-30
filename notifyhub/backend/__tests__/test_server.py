import pytest
from fastapi.testclient import TestClient
from notifyhub.backend.backend import app
from notifyhub.backend.models import NotificationStore
import notifyhub.backend.backend as backend


@pytest.fixture(autouse=True)
def reset_store():
    # Reset the global store before each test
    backend.store = NotificationStore()


@pytest.fixture
def client():
    return TestClient(app)


class TestNotifyAPI:
    def test_notify_post_success(self, client):
        response = client.post("/api/notify", json={"data": {"message": "Test notification"}})

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