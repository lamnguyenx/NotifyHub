import json
from datetime import datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient
from notifyhub.backend.backend import app
from notifyhub.backend.models import AgentStatusStore
from notifyhub.crypto import decrypt_payload, encrypt_payload, is_envelope
import notifyhub.backend.backend as backend

# Same fixed fixture as tests/notifyhub/backend/test_server.py.
E2E_KEY = bytes(range(32))


@pytest.fixture(autouse=True)
def reset_store(monkeypatch):
    backend.status_store = AgentStatusStore()
    monkeypatch.setattr(backend, "_e2e_enabled", False)
    monkeypatch.setattr(backend, "_e2e_key", None)


@pytest.fixture
def client():
    return TestClient(app)


class TestAgentStatusStore:

    def test_new_entry_created(self):
        store = AgentStatusStore(stale_after=300)
        changed = store.update("claude", "s1", "running", pwd="/w")
        assert changed is True
        entries = store.list_payloads()
        assert len(entries) == 1
        assert entries[0]["state"] == "running"

    def test_refresh_while_running_is_silent_no_state_change(self):
        store = AgentStatusStore(stale_after=300)
        store.update("claude", "s1", "running")
        changed = store.update("claude", "s1", "running")
        assert changed is False
        entries = store.list_payloads()
        assert len(entries) == 1

    def test_stale_running_served_but_not_mutated(self):
        store = AgentStatusStore(stale_after=300)
        store.update("codex", "s1", "running")
        # Simulate the last refresh happening long ago.
        store.statuses[("codex", "s1")].updated = (
            datetime.now(timezone.utc) - timedelta(seconds=301)
        ).isoformat()
        assert store.list_payloads()[0]["state"] == "stale"
        # Store keeps the real state; a late refresh revives + re-announces.
        assert store.update("codex", "s1", "running") is True

    def test_pwd_change_reannounces(self):
        store = AgentStatusStore(stale_after=300)
        store.update("opencode", "s1", "running", pwd="/a")
        assert store.update("opencode", "s1", "running", pwd="/b") is True
        assert store.list_payloads()[0]["pwd"] == "/b"

    def test_host_change_reannounces(self):
        store = AgentStatusStore(stale_after=300)
        store.update("claude", "s1", "running", host="172.21.0.1")
        assert store.update("claude", "s1", "running", host="kientt44") is True
        assert store.list_payloads()[0]["host"] == "kientt44"

    def test_new_task_excerpt_reannounces_and_refresh_keeps_it(self):
        store = AgentStatusStore(stale_after=300)
        store.update("claude", "s1", "running", task="first prompt")
        # A refresh without a task does not clobber or re-announce.
        assert store.update("claude", "s1", "running", task=None) is False
        assert store.list_payloads()[0]["task"] == "first prompt"
        # A new turn (same session) re-announces with the new excerpt.
        assert store.update("claude", "s1", "running", task="second prompt") is True
        assert store.list_payloads()[0]["task"] == "second prompt"

    def test_entry_transform_applies_to_payloads(self):
        store = AgentStatusStore(
            stale_after=300,
            entry_transform=lambda payload: {"wrapped": payload},
        )
        store.update("claude", "s1", "idle")
        assert store.list_payloads()[0] == {
            "wrapped": {
                "agent": "claude",
                "session_id": "s1",
                "state": "idle",
                "pwd": None,
                "host": None,
                "task": None,
                "since": store.statuses[("claude", "s1")].since,
                "updated": store.statuses[("claude", "s1")].updated,
            }
        }


class TestStatusAPI:

    def test_report_and_list_roundtrip(self, client):
        response = client.post(
            "/api/status/claude/running",
            json={"session_id": "abc", "cwd": "/home/user/proj"},
        )
        assert response.status_code == 200
        assert response.json() == {"success": True, "changed": True}

        listed = client.get("/api/status").json()
        assert listed["agents"][0]["agent"] == "claude"
        assert listed["agents"][0]["state"] == "running"
        assert listed["agents"][0]["pwd"] == "/home/user/proj"

    def test_raw_hook_payload_shapes(self, client):
        # claude/codex curl hooks pipe their hook payload verbatim.
        for agent, hook_payload in [
            ("claude", {"session_id": "c1", "cwd": "/w", "hook_event_name": "Stop"}),
            ("codex", {"session_id": "k1", "cwd": "/w", "turn_id": "t"}),
        ]:
            response = client.post(
                f"/api/status/{agent}/running",
                content=json.dumps(hook_payload),
                headers={"content-type": "text/plain"},  # curl --data-binary default
            )
            assert response.json()["success"] is True

        agents = {e["agent"]: e for e in client.get("/api/status").json()["agents"]}
        assert set(agents) == {"claude", "codex"}
        assert all(e["pwd"] == "/w" for e in agents.values())

    def test_opencode_payload_shape(self, client):
        response = client.post(
            "/api/status/opencode/blocked",
            json={"session_id": "ses_1", "pwd": "/proj", "host": "wsk"},
        )
        assert response.json()["success"] is True
        entry = client.get("/api/status").json()["agents"][0]
        assert entry["host"] == "wsk"
        assert entry["state"] == "blocked"

    def test_host_falls_back_to_client_address(self, client):
        client.post("/api/status/opencode/running", json={"session_id": "s"})
        entry = client.get("/api/status").json()["agents"][0]
        assert entry["host"] == "testclient"

    def test_host_header_used_before_client_address(self, client):
        # The raw curl hooks pipe the upstream JSON unchanged, so the machine
        # name arrives in a header rather than the body.
        client.post(
            "/api/status/claude/running",
            json={"session_id": "s"},
            headers={"x-notifyhub-host": "kientt44"},
        )
        entry = client.get("/api/status").json()["agents"][0]
        assert entry["host"] == "kientt44"

    def test_body_host_wins_over_header(self, client):
        client.post(
            "/api/status/opencode/running",
            json={"session_id": "s", "host": "wsk"},
            headers={"x-notifyhub-host": "header-host"},
        )
        entry = client.get("/api/status").json()["agents"][0]
        assert entry["host"] == "wsk"

    def test_unknown_agent_or_state_fails(self, client):
        assert "error" in client.post(
            "/api/status/droid/running", json={"session_id": "s"}
        ).json()
        assert "error" in client.post(
            "/api/status/claude/paused", json={"session_id": "s"}
        ).json()

    def test_missing_session_id_fails(self, client):
        assert "error" in client.post("/api/status/claude/running", json={}).json()

    def test_task_excerpt_extraction(self, client):
        # claude/codex curl hooks pipe the raw UserPromptSubmit payload.
        response = client.post(
            "/api/status/claude/running",
            json={"session_id": "s1", "cwd": "/w", "prompt": "  fix the\n  login bug  "},
        )
        assert response.json()["success"] is True
        entry = client.get("/api/status").json()["agents"][0]
        assert entry["task"] == "fix the login bug"

    def test_task_excerpt_from_opencode_task_field(self, client):
        client.post(
            "/api/status/opencode/running",
            json={"session_id": "s1", "task": "refactor the parser"},
        )
        entry = client.get("/api/status").json()["agents"][0]
        assert entry["task"] == "refactor the parser"

    def test_task_excerpt_truncated_to_one_line(self, client):
        long_prompt = "x" * 300
        client.post(
            "/api/status/codex/running",
            json={"session_id": "s1", "prompt": long_prompt},
        )
        entry = client.get("/api/status").json()["agents"][0]
        assert len(entry["task"]) == 160
        assert entry["task"].endswith("…")

    def test_garbage_body_is_rejected_not_crashing(self, client):
        response = client.post(
            "/api/status/claude/running", content=b"not json{"
        )
        # No session_id recoverable → graceful error.
        assert response.status_code == 200
        assert "error" in response.json()

    def test_empty_body_accepted_without_crash(self, client):
        # Nothing sends this today (session always rides in the body), but the
        # endpoint must not 500 on an empty body.
        response = client.post("/api/status/claude/running")
        assert response.status_code == 200
        assert "error" in response.json()

    def test_duplicate_report_not_changed(self, client):
        client.post("/api/status/claude/idle", json={"session_id": "s"})
        second = client.post("/api/status/claude/idle", json={"session_id": "s"})
        assert second.json() == {"success": True, "changed": False}

    def test_e2e_envelope_ingest_and_serving(self, client, monkeypatch):
        monkeypatch.setattr(backend, "_e2e_enabled", True)
        monkeypatch.setattr(backend, "_e2e_key", E2E_KEY)
        # Rebuild the store the way _load_runtime would with e2e enabled.
        from notifyhub.backend.models import AgentStatusStore

        backend.status_store = AgentStatusStore(
            entry_transform=lambda payload: encrypt_payload(payload, E2E_KEY)
        )

        envelope = encrypt_payload({"session_id": "s1", "pwd": "/w"}, E2E_KEY)
        response = client.post("/api/status/claude/running", json=envelope)
        assert response.json()["success"] is True

        entry = client.get("/api/status").json()["agents"][0]
        assert is_envelope(entry)  # served as an e2e envelope
        assert decrypt_payload(entry, E2E_KEY)["pwd"] == "/w"
