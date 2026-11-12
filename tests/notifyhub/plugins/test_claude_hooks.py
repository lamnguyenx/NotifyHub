import importlib.util
import json
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
        for event in ("UserPromptSubmit", "PostToolUse", "PermissionRequest"):
            assert hook.status_event({"hook_event_name": event}) is None


class TestInstaller:

    def test_status_hooks_installed_and_strippable(self):
        foreign = {"hooks": [{"type": "command", "command": "echo foreign"}]}
        hooks = install.merge_hooks({"Stop": [foreign]})

        for event in ("UserPromptSubmit", "PostToolUse"):
            command = hooks[event][0]["hooks"][0]["command"]
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

    def test_plugin_hooks_json_status_one_liners_carry_the_host_header(self):
        data = json.loads((PLUGIN_DIR / "hooks" / "hooks.json").read_text(encoding="utf-8"))
        for event in ("UserPromptSubmit", "PostToolUse"):
            command = data["hooks"][event][0]["hooks"][0]["command"]
            assert "/api/status/claude/running" in command
            assert "x-notifyhub-host: $m" in command
