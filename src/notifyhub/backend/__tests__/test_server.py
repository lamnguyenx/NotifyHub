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
        assert (
            backend.store.notifications[0].model_dump(
                exclude={'id', 'timestamp'}, exclude_none=True
            )
            == data
        )



    def test_notify_post_multiple_notifications(self, client):
        # Send multiple notifications
        client.post("/api/notify", json={"data": {"message": "First"}})
        client.post("/api/notify", json={"data": {"message": "Second"}})
        client.post("/api/notify", json={"data": {"message": "Third"}})

        # Check they are stored in correct order (newest first)
        assert len(backend.store.notifications) == 3
        assert backend.store.notifications[0].message == "Third"
        assert backend.store.notifications[1].message == "Second"
        assert backend.store.notifications[2].message == "First"



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
        create_response = client.post("/api/notify", json={"data": {"message": "Second"}})
        delete_id = create_response.json()["id"]
        client.post("/api/notify", json={"data": {"message": "Third"}})

        # Delete middle notification
        response = client.delete(f"/api/notifications?id={delete_id}")

        assert response.status_code == 200

        # Should have 2 notifications left
        assert len(backend.store.notifications) == 2

        # Verify the deleted one is gone and others remain
        remaining_messages = [n.message for n in backend.store.notifications]
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
