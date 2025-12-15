import pytest
from fastapi.testclient import TestClient
from notifyhub.server import app
from notifyhub.models import NotificationStore
import notifyhub.server


@pytest.fixture(autouse=True)
def reset_store():
    # Reset the global store before each test
    notifyhub.server.store = NotificationStore()


@pytest.fixture
def client():
    return TestClient(app)


class TestNotifyAPI:
    def test_notify_post_success(self, client):
        response = client.post("/api/notify", json={"message": "Test notification"})
        
        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert "id" in data
        assert isinstance(data["id"], str)
    
    def test_notify_post_empty_message(self, client):
        response = client.post("/api/notify", json={"message": ""})
        
        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
    
    def test_notify_post_stores_notification(self, client):
        message = "Stored notification"
        response = client.post("/api/notify", json={"message": message})

        assert response.status_code == 200

        # Check that notification was stored
        assert len(notifyhub.server.store.notifications) == 1
        assert notifyhub.server.store.notifications[0].message == message
    
    def test_notify_post_multiple_notifications(self, client):
        # Send multiple notifications
        client.post("/api/notify", json={"message": "First"})
        client.post("/api/notify", json={"message": "Second"})
        client.post("/api/notify", json={"message": "Third"})

        # Check they are stored in correct order (newest first)
        assert len(notifyhub.server.store.notifications) == 3
        assert notifyhub.server.store.notifications[0].message == "Third"
        assert notifyhub.server.store.notifications[1].message == "Second"
        assert notifyhub.server.store.notifications[2].message == "First"


class TestNotificationsAPI:
    def test_get_notifications_empty(self, client):
        response = client.get("/api/notifications")
        
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        assert len(data) == 0
    
    def test_get_notifications_with_data(self, client):
        # Add some notifications
        client.post("/api/notify", json={"message": "First"})
        client.post("/api/notify", json={"message": "Second"})
        
        response = client.get("/api/notifications")
        
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        assert len(data) == 2
        
        # Check structure
        notification = data[0]
        assert "id" in notification
        assert "message" in notification
        assert "timestamp" in notification
        assert notification["message"] == "Second"  # Newest first
    
    def test_get_notifications_returns_list_of_dicts(self, client):
        client.post("/api/notify", json={"message": "Test"})
        
        response = client.get("/api/notifications")
        data = response.json()
        
        assert isinstance(data, list)
        assert isinstance(data[0], dict)
        assert all(key in data[0] for key in ["id", "message", "timestamp"])


class TestRootEndpoint:
    def test_root_get_returns_html(self, client):
        response = client.get("/")
        
        assert response.status_code == 200
        assert "text/html" in response.headers["content-type"]
        assert "NotifyHub" in response.text
    
    def test_root_serves_vue_app(self, client):
        response = client.get("/")
        
        # Should contain the Vue app mounting point
        assert '<div id="app">' in response.text
        assert '<script src="/static/app.js"></script>' in response.text