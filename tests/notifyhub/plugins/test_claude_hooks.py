import importlib.util
import json
import os
from pathlib import Path

PLUGIN_DIR = Path(__file__).resolve().parents[3] / "src" / "notifyhub" / "plugins" / "claude"

import pytest


def load_module(name: str, filename: str):
    spec = importlib.util.spec_from_file_location(name, PLUGIN_DIR / filename)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module


hook = load_module("notifyhub_claude_hook", "notifyhub-claude.py")
install = load_module("notifyhub_claude_install", "install.py")


class TestStatusEvents:
    """status_event(): hook payload → lifecycle state mapping."""

    def test_stop_idle(self):
        assert hook.status_event({"hook_event_name": "Stop"}) == "idle"

    def test_stop_hook_active_stays_running(self):
        assert (
            hook.status_event({"hook_event_name": "Stop", "stop_hook_active": True})
            is None
        )

    def test_stop_failure_idle(self):
        assert hook.status_event({"hook_event_name": "StopFailure"}) == "idle"

    def test_handled_notification_types_blocked(self):
        for kind in sorted(hook.HANDLED_NOTIFICATION_TYPES):
            assert (
                hook.status_event(
                    {"hook_event_name": "Notification", "notification_type": kind}
                )
                == "blocked"
            )

    def test_unhandled_notification_types_have_no_state(self):
        for kind in ("idle_prompt", "auth_required", "plugin_error"):
            assert (
                hook.status_event(
                    {"hook_event_name": "Notification", "notification_type": kind}
                )
                is None
            )

    def test_other_events_none(self):
        for event in ("PostToolUse", "PermissionRequest"):
            assert hook.status_event({"hook_event_name": event}) is None

    def test_prompt_submit_running(self):
        # Turn start: the hook reports running and spawns the heartbeat watcher.
        assert hook.status_event({"hook_event_name": "UserPromptSubmit"}) == "running"


class TestHeartbeat:
    """The detached --heartbeat watcher that keeps long turns `running`."""

    def test_heartbeat_body_carries_flag_and_prompt(self, monkeypatch):
        bodies = []

        class Response:
            def __enter__(self):
                return self

            def __exit__(self, *args):
                pass

        def capture(request, timeout):
            bodies.append(json.loads(request.data))
            return Response()

        monkeypatch.setattr(hook._DIRECT_OPENER, "open", capture)
        monkeypatch.setenv("NOTIFYHUB_CLI_ENABLED", "true")
        monkeypatch.setenv("NOTIFYHUB_CLI_HOST", "127.0.0.1")
        payload = {
            "session_id": "hb-1",
            "cwd": "/w",
            "hook_event_name": "UserPromptSubmit",
            "prompt": "fix it",
        }

        hook.post_status(payload, "running", heartbeat=True)
        assert bodies[-1]["heartbeat"] is True
        assert bodies[-1]["prompt"] == "fix it"

        hook.post_status(payload, "running")
        assert "heartbeat" not in bodies[-1]

    def test_start_heartbeat_claims_lease_and_spawns_once(self, monkeypatch, tmp_path):
        monkeypatch.setenv("NOTIFYHUB_HEARTBEAT_DIR", str(tmp_path))
        monkeypatch.setenv("NOTIFYHUB_CLI_ENABLED", "true")
        spawned = []
        monkeypatch.setattr(hook, "_spawn_watcher", lambda path: spawned.append(path))
        payload = {"session_id": "ses_123", "cwd": "/w", "hook_event_name": "UserPromptSubmit"}

        hook.start_heartbeat(payload)

        assert len(spawned) == 1
        (lease_file,) = list(tmp_path.iterdir())
        assert json.loads(lease_file.read_text(encoding="utf-8"))["payload"] == payload

    def test_start_heartbeat_skips_when_a_watcher_is_alive(self, monkeypatch, tmp_path):
        monkeypatch.setenv("NOTIFYHUB_HEARTBEAT_DIR", str(tmp_path))
        monkeypatch.setenv("NOTIFYHUB_CLI_ENABLED", "true")
        spawned = []
        monkeypatch.setattr(hook, "_spawn_watcher", lambda path: spawned.append(path))
        payload = {"session_id": "ses_123", "hook_event_name": "UserPromptSubmit"}
        hook.start_heartbeat(payload)

        # Simulate the watcher rewriting the lease with its pid.
        lease_file = tmp_path / os.path.basename(hook.lease_path("ses_123"))
        lease_file.write_text(
            json.dumps({"pid": 4242, "payload": payload}), encoding="utf-8"
        )
        monkeypatch.setattr(hook, "_watcher_alive", lambda lease, path: True)

        hook.start_heartbeat(payload)

        assert len(spawned) == 1  # no second watcher
        assert json.loads(lease_file.read_text(encoding="utf-8"))["pid"] == 4242

    def test_start_heartbeat_steals_a_dead_watchers_lease(self, monkeypatch, tmp_path):
        monkeypatch.setenv("NOTIFYHUB_HEARTBEAT_DIR", str(tmp_path))
        monkeypatch.setenv("NOTIFYHUB_CLI_ENABLED", "true")
        spawned = []
        monkeypatch.setattr(hook, "_spawn_watcher", lambda path: spawned.append(path))
        payload = {"session_id": "ses_123", "hook_event_name": "UserPromptSubmit"}
        hook.start_heartbeat(payload)
        monkeypatch.setattr(hook, "_watcher_alive", lambda lease, path: False)

        hook.start_heartbeat(payload)

        assert len(spawned) == 2

    def test_start_heartbeat_ignores_unsafe_session_ids(self, monkeypatch, tmp_path):
        monkeypatch.setenv("NOTIFYHUB_HEARTBEAT_DIR", str(tmp_path))
        monkeypatch.setenv("NOTIFYHUB_CLI_ENABLED", "true")
        spawned = []
        monkeypatch.setattr(hook, "_spawn_watcher", lambda path: spawned.append(path))

        for session in ("../escape", "with space/x", "", "semi;colon"):
            hook.start_heartbeat({"session_id": session, "hook_event_name": "UserPromptSubmit"})

        assert spawned == []
        assert list(tmp_path.iterdir()) == []

    def test_stop_heartbeat_unlinks_and_terminates_a_verified_watcher(self, monkeypatch, tmp_path):
        monkeypatch.setenv("NOTIFYHUB_HEARTBEAT_DIR", str(tmp_path))
        path = hook.lease_path("ses_123")
        with open(path, "w", encoding="utf-8") as fh:
            json.dump({"pid": 4242, "payload": {}}, fh)
        monkeypatch.setattr(hook, "_watcher_alive", lambda lease, location: True)
        kills = []
        monkeypatch.setattr(hook.os, "kill", lambda pid, sig: kills.append((pid, sig)))

        hook.stop_heartbeat({"session_id": "ses_123"})

        assert not os.path.exists(path)
        assert kills == [(4242, hook.signal.SIGTERM)]

    def test_run_heartbeat_posts_running_until_the_lease_disappears(self, monkeypatch, tmp_path):
        path = tmp_path / "lease.json"
        path.write_text(
            json.dumps(
                {
                    "pid": 0,
                    "payload": {
                        "session_id": "s1",
                        "cwd": "/w",
                        "hook_event_name": "UserPromptSubmit",
                        "prompt": "keep the excerpt",
                    },
                }
            ),
            encoding="utf-8",
        )
        posts = []
        monkeypatch.setattr(
            hook,
            "post_status",
            lambda payload, state, heartbeat=False: posts.append(
                (state, heartbeat, payload.get("prompt"))
            ),
        )
        cycles = {"count": 0}

        def fake_sleep(seconds):
            cycles["count"] += 1
            if cycles["count"] == 3:
                os.unlink(path)  # the turn's Stop hook ended the heartbeat

        monkeypatch.setattr(hook.time, "sleep", fake_sleep)
        monkeypatch.setenv("NOTIFYHUB_HEARTBEAT_INTERVAL_SECONDS", "1")

        hook.run_heartbeat(str(path))

        assert [post[0] for post in posts] == ["running", "running"]
        assert all(post[1] for post in posts)
        assert all(post[2] == "keep the excerpt" for post in posts)

    def test_run_heartbeat_age_cap_unlinks_and_never_posts(self, monkeypatch, tmp_path):
        path = tmp_path / "lease.json"
        path.write_text(json.dumps({"pid": 0, "payload": {"session_id": "s1"}}), encoding="utf-8")
        posts = []
        monkeypatch.setattr(hook, "post_status", lambda *args, **kwargs: posts.append(args))
        monkeypatch.setenv("NOTIFYHUB_HEARTBEAT_MAX_MINUTES", "0")  # disabled

        hook.run_heartbeat(str(path))

        assert posts == []
        assert not path.exists()


class TestInstaller:

    def test_status_hooks_installed_and_strippable(self):
        foreign = {"hooks": [{"type": "command", "command": "echo foreign"}]}
        hooks = install.merge_hooks({"Stop": [foreign]})

        # Turn start runs the python hook: running report + prompt forwarding
        # + the detached --heartbeat watcher.
        prompt_handler = hooks["UserPromptSubmit"][0]["hooks"][0]
        assert "notifyhub-claude.py" in prompt_handler["command"]
        assert prompt_handler["async"] is True

        # The per-tool-call refresh stays the raw curl one-liner.
        command = hooks["PostToolUse"][0]["hooks"][0]["command"]
        assert install.STATUS_HOOK_MARKER in command
        assert "curl" in command
        # `${VAR-default}` (no colon) keeps the empty-string mute working.
        assert "${NOTIFYHUB_CLI_HOST-127.0.0.1}" in command
        # The raw hook payload has no machine name; send it in a header.
        assert "x-notifyhub-host: $m" in command

        stripped = install.strip_hooks(hooks)
        assert "UserPromptSubmit" not in stripped
        assert "PostToolUse" not in stripped
        assert stripped["Stop"] == [foreign]

    def test_merge_is_idempotent(self):
        merged = install.merge_hooks({})
        merged_again = install.merge_hooks(merged)
        assert merged == merged_again


class TestPluginLayout:

    def test_plugin_hooks_json_matches_the_installer_wiring(self):
        data = json.loads((PLUGIN_DIR / "hooks" / "hooks.json").read_text(encoding="utf-8"))
        # Turn start goes through the python hook (running + watcher spawn).
        assert (
            data["hooks"]["UserPromptSubmit"][0]["hooks"][0]["command"]
            == "${CLAUDE_PLUGIN_ROOT}/notifyhub-claude.py"
        )
        # The per-tool refresh remains the curl one-liner with the host header.
        command = data["hooks"]["PostToolUse"][0]["hooks"][0]["command"]
        assert "/api/status/claude/running" in command
        assert "x-notifyhub-host: $m" in command
