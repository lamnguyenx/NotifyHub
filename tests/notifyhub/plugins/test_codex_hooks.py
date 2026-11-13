import importlib.util
import json
import os
import subprocess
import sys
from pathlib import Path

PLUGIN_DIR = Path(__file__).resolve().parents[3] / "src" / "notifyhub" / "plugins" / "codex"


def load_module(name: str, filename: str):
    spec = importlib.util.spec_from_file_location(name, PLUGIN_DIR / filename)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module


hook = load_module("notifyhub_codex_hook", "notifyhub-codex.py")
install = load_module("notifyhub_codex_install", "install.py")


def write_transcript(path: Path, entries) -> str:
    path.write_text("\n".join(json.dumps(entry) for entry in entries) + "\n", encoding="utf-8")
    return str(path)


def message(role: str, text: str, turn_id: str = "turn-1", kinds=None):
    meta = {"turn_id": turn_id}
    if kinds is not None:
        meta["content_item_kinds"] = kinds
        meta["content_item_metadata"] = [{"provenance": {"type": "user" if kinds == ["user.text"] else "harness"}}]
    return {
        "type": "response_item",
        "payload": {
            "type": "message",
            "role": role,
            "content": [
                {
                    "type": "input_text" if role == "user" else "output_text",
                    "text": text,
                }
            ],
            "internal_chat_message_metadata_passthrough": meta,
        },
    }


def task_complete(text: str, turn_id: str = "turn-1"):
    return {
        "type": "event_msg",
        "payload": {"type": "task_complete", "turn_id": turn_id, "last_agent_message": text},
    }


def turn_context(
    turn_id: str = "turn-1",
    approval_policy: str = "on-request",
    approvals_reviewer: str = "user",
):
    return {
        "type": "turn_context",
        "payload": {
            "turn_id": turn_id,
            "approval_policy": approval_policy,
            "approvals_reviewer": approvals_reviewer,
        },
    }


class TestTranscriptRecovery:

    def test_stop_skips_harness_user_messages(self, tmp_path):
        transcript = write_transcript(
            tmp_path / "rollout.jsonl",
            [
                message("user", "AGENTS.md instructions", kinds=["agents_md.instructions"]),
                message("user", "<environment_context>cwd</environment_context>", kinds=["environments.environment_context"]),
                message("user", "fix the bug", kinds=["user.text"]),
                message("assistant", "working on it"),
                task_complete("done"),
                task_complete("old turn", turn_id="turn-0"),
            ],
        )

        body = hook.notification_body(
            {
                "hook_event_name": "Stop",
                "turn_id": "turn-1",
                "transcript_path": transcript,
                "last_assistant_message": None,
                "stop_hook_active": False,
            }
        )

        assert body == "[#tag:@USER] fix the bug\n[#tag:@ASSISTANT] done"

    def test_stop_prefers_last_assistant_message(self, tmp_path):
        transcript = write_transcript(tmp_path / "rollout.jsonl", [task_complete("from transcript")])

        body = hook.notification_body(
            {
                "hook_event_name": "Stop",
                "turn_id": "turn-1",
                "transcript_path": transcript,
                "last_assistant_message": "from payload",
            }
        )

        assert "[#tag:@ASSISTANT] from payload" in body

    def test_stop_hook_active_is_silent(self):
        assert (
            hook.notification_body(
                {"hook_event_name": "Stop", "stop_hook_active": True, "turn_id": "turn-1"}
            )
            is None
        )

    def test_interrupt_recovers_last_assistant_message(self, tmp_path):
        transcript = write_transcript(
            tmp_path / "rollout.jsonl",
            [
                message("user", "do the thing", kinds=["user.text"]),
                message("assistant", "half way"),
            ],
        )

        body = hook.notification_body(
            {"hook_event_name": "Interrupt", "turn_id": "turn-1", "transcript_path": transcript}
        )

        assert body == "[#tag:@USER] do the thing\n[#tag:@ASSISTANT] half way"

    def test_interrupt_without_transcript_uses_fallback(self):
        body = hook.notification_body(
            {"hook_event_name": "Interrupt", "turn_id": "turn-1", "transcript_path": None}
        )

        assert body == "[#tag:@USER] \n[#tag:@ASSISTANT] Codex turn interrupted"


class TestTruncation:

    def test_keeps_last_lines_and_marks_the_rest(self):
        text = "\n".join(f"line {i}" for i in range(10))

        result = hook.truncate_text(text)

        assert result.startswith("[#truncated:+5 LINES]")
        assert "line 9" in result
        assert "line 4" not in result

    def test_keeps_last_chars_and_marks_the_rest(self):
        result = hook.truncate_text("x" * 400)

        assert result.startswith("[#truncated:+200 CHARS]")
        assert len(result.split("]", 1)[1]) <= 200


class TestEventBodies:

    def test_permission_request_uses_description(self):
        body = hook.notification_body(
            {
                "hook_event_name": "PermissionRequest",
                "tool_name": "Bash",
                "tool_input": {"description": "Run the test suite"},
            }
        )
        assert body == "[#codex.permission] Run the test suite"

    def test_permission_request_falls_back_to_tool_name(self):
        body = hook.notification_body(
            {"hook_event_name": "PermissionRequest", "tool_name": "Bash", "tool_input": {}}
        )
        assert body == "[#codex.permission] Codex needs your permission to use Bash"

    def test_permission_request_skips_auto_reviewed_turn(self, tmp_path):
        transcript = write_transcript(
            tmp_path / "rollout.jsonl", [turn_context(approvals_reviewer="auto_review")]
        )

        assert (
            hook.notification_body(
                {
                    "hook_event_name": "PermissionRequest",
                    "turn_id": "turn-1",
                    "transcript_path": transcript,
                    "tool_name": "Bash",
                    "tool_input": {"description": "Run the test suite"},
                }
            )
            is None
        )

    def test_permission_request_notifies_for_user_reviewed_turn(self, tmp_path):
        transcript = write_transcript(
            tmp_path / "rollout.jsonl", [turn_context(approvals_reviewer="user")]
        )

        assert hook.notification_body(
            {
                "hook_event_name": "PermissionRequest",
                "turn_id": "turn-1",
                "transcript_path": transcript,
                "tool_name": "Bash",
                "tool_input": {"description": "Run the test suite"},
            }
        ) == "[#codex.permission] Run the test suite"

    def test_permission_request_uses_latest_matching_turn_context(self, tmp_path):
        transcript = write_transcript(
            tmp_path / "rollout.jsonl",
            [
                turn_context(approvals_reviewer="auto_review"),
                turn_context(approvals_reviewer="user"),
            ],
        )

        assert hook.notification_body(
            {
                "hook_event_name": "PermissionRequest",
                "turn_id": "turn-1",
                "transcript_path": transcript,
                "tool_name": "Bash",
                "tool_input": {},
            }
        ) == "[#codex.permission] Codex needs your permission to use Bash"

    def test_permission_request_ignores_auto_review_from_other_turns(self, tmp_path):
        transcript = write_transcript(
            tmp_path / "rollout.jsonl",
            [turn_context(turn_id="turn-0", approvals_reviewer="auto_review")],
        )

        assert hook.notification_body(
            {
                "hook_event_name": "PermissionRequest",
                "turn_id": "turn-1",
                "transcript_path": transcript,
                "tool_name": "Bash",
                "tool_input": {},
            }
        ) == "[#codex.permission] Codex needs your permission to use Bash"

    def test_permission_request_skips_bypass_permissions_mode(self):
        assert (
            hook.notification_body(
                {
                    "hook_event_name": "PermissionRequest",
                    "permission_mode": "bypassPermissions",
                    "tool_name": "Bash",
                    "tool_input": {},
                }
            )
            is None
        )

    def test_permission_request_skips_never_policy_from_transcript(self, tmp_path):
        transcript = write_transcript(
            tmp_path / "rollout.jsonl",
            [turn_context(approval_policy="never", approvals_reviewer="user")],
        )

        assert (
            hook.notification_body(
                {
                    "hook_event_name": "PermissionRequest",
                    "turn_id": "turn-1",
                    "transcript_path": transcript,
                    "tool_name": "Bash",
                    "tool_input": {},
                }
            )
            is None
        )

    def test_permission_request_notifies_without_turn_context(self):
        assert hook.notification_body(
            {
                "hook_event_name": "PermissionRequest",
                "turn_id": "turn-1",
                "transcript_path": "/nonexistent",
                "tool_name": "Bash",
                "tool_input": {},
            }
        ) == "[#codex.permission] Codex needs your permission to use Bash"

    def test_question_from_request_user_input(self):
        body = hook.notification_body(
            {
                "hook_event_name": "PreToolUse",
                "tool_name": "request_user_input",
                "tool_input": {
                    "questions": [
                        {"question": "Which database should I use?"},
                        {"header": "Tests", "question": "Add tests now?"},
                    ]
                },
            }
        )
        assert body == "[#codex.question] Which database should I use?\nAdd tests now?"

    def test_pre_tool_use_ignores_other_tools(self):
        assert (
            hook.notification_body(
                {"hook_event_name": "PreToolUse", "tool_name": "Bash", "tool_input": {}}
            )
            is None
        )

    def test_post_model_request_only_notifies_on_failure(self):
        assert (
            hook.notification_body(
                {"hook_event_name": "PostModelRequest", "status": "completed", "error": None}
            )
            is None
        )
        assert (
            hook.notification_body(
                {"hook_event_name": "PostModelRequest", "status": "failed", "error": "boom"}
            )
            == "[#codex.error] boom"
        )


class TestStatusEvents:
    """status_event(): hook payload → lifecycle state mapping."""

    def test_stop_and_interrupt_idle(self):
        assert hook.status_event({"hook_event_name": "Stop"}) == "idle"
        assert hook.status_event({"hook_event_name": "Interrupt"}) == "idle"

    def test_stop_hook_active_stays_running(self):
        assert (
            hook.status_event({"hook_event_name": "Stop", "stop_hook_active": True})
            is None
        )

    def test_prompt_submit_running(self):
        assert hook.status_event({"hook_event_name": "UserPromptSubmit"}) == "running"

    def test_prompt_submit_is_not_a_notification(self):
        # `running` once leaked here as a literal notification body on the
        # Windows reporter path; the running report covers it now.
        assert hook.notification_body({"hook_event_name": "UserPromptSubmit"}) is None

    def test_model_request_is_running_heartbeat(self):
        for status in ("failed", "completed", "cancelled"):
            assert (
                hook.status_event(
                    {"hook_event_name": "PostModelRequest", "status": status}
                )
                == "running"
            )

    def test_permission_request_blocked_for_humans(self):
        assert hook.status_event({"hook_event_name": "PermissionRequest"}) == "blocked"

    def test_question_tool_blocked(self):
        assert (
            hook.status_event(
                {"hook_event_name": "PreToolUse", "tool_name": "request_user_input"}
            )
            == "blocked"
        )
        assert (
            hook.status_event({"hook_event_name": "PreToolUse", "tool_name": "shell"})
            is None
        )

    def test_unknown_event_none(self):
        assert hook.status_event({"hook_event_name": "Whatever"}) is None


class TestClaimOnce:

    def test_claim_is_once_per_session_turn_and_kind(self, tmp_path, monkeypatch):
        monkeypatch.setenv("NOTIFYHUB_CODEX_STATE_DIR", str(tmp_path))
        payload = {"session_id": "s1", "turn_id": "t1"}

        assert hook.claim_once("completion", payload) is True
        assert hook.claim_once("completion", payload) is False
        assert hook.claim_once("error", payload) is True
        assert hook.claim_once("completion", {**payload, "turn_id": "t2"}) is True

    def test_missing_turn_does_not_dedupe(self, tmp_path, monkeypatch):
        monkeypatch.setenv("NOTIFYHUB_CODEX_STATE_DIR", str(tmp_path))
        assert hook.claim_once("completion", {"session_id": "s1"}) is True
        assert hook.claim_once("completion", {"session_id": "s1"}) is True

    def test_old_claim_files_are_pruned(self, tmp_path, monkeypatch):
        monkeypatch.setenv("NOTIFYHUB_CODEX_STATE_DIR", str(tmp_path))
        stale = tmp_path / "stale-claim"
        stale.write_text("", encoding="utf-8")
        os.utime(stale, (0, 0))

        hook.claim_once("completion", {"session_id": "s1", "turn_id": "t1"})

        assert not stale.exists()


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

    def test_start_heartbeat_respects_mute(self, monkeypatch, tmp_path):
        monkeypatch.setenv("NOTIFYHUB_HEARTBEAT_DIR", str(tmp_path))
        monkeypatch.setenv("NOTIFYHUB_CLI_ENABLED", "false")
        spawned = []
        monkeypatch.setattr(hook, "_spawn_watcher", lambda path: spawned.append(path))

        hook.start_heartbeat({"session_id": "ses_123", "hook_event_name": "UserPromptSubmit"})

        assert spawned == []

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

    def test_stop_heartbeat_never_kills_an_unverified_pid(self, monkeypatch, tmp_path):
        monkeypatch.setenv("NOTIFYHUB_HEARTBEAT_DIR", str(tmp_path))
        path = hook.lease_path("ses_123")
        with open(path, "w", encoding="utf-8") as fh:
            json.dump({"pid": 4242, "payload": {}}, fh)
        monkeypatch.setattr(hook, "_watcher_alive", lambda lease, location: False)
        kills = []
        monkeypatch.setattr(hook.os, "kill", lambda pid, sig: kills.append((pid, sig)))

        hook.stop_heartbeat({"session_id": "ses_123"})

        assert not os.path.exists(path)
        assert kills == []

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

    def test_run_heartbeat_missing_lease_is_silent(self, monkeypatch, tmp_path):
        posts = []
        monkeypatch.setattr(hook, "post_status", lambda *args, **kwargs: posts.append(args))
        hook.run_heartbeat(str(tmp_path / "absent.json"))
        assert posts == []


class TestInstaller:

    def test_status_events_installed_and_strippable(self):
        hooks = {}
        merged = install.merge_hooks(hooks)

        # Turn start reports running through the python hook, which also
        # forwards the prompt and spawns the detached --heartbeat watcher.
        handler = merged["UserPromptSubmit"][0]["hooks"][0]
        assert install.HOOK_MARKER in handler["command"]
        assert handler["async"] is True
        assert "notifyhub-codex.py" in handler["commandWindows"]

        stripped = install.strip_hooks(merged)
        assert "UserPromptSubmit" not in stripped

    def test_legacy_curl_turn_start_hooks_are_replaced(self):
        legacy = {"hooks": [install.status_curl_handler()]}

        merged = install.merge_hooks({"UserPromptSubmit": legacy})

        assert merged["UserPromptSubmit"] == install.HOOK_EVENTS["UserPromptSubmit"]
        assert "UserPromptSubmit" not in install.strip_hooks(merged)

    def test_merge_preserves_foreign_hooks_and_is_idempotent(self):
        foreign = {"hooks": [{"type": "command", "command": "echo foreign"}]}
        hooks = {"Stop": [foreign]}

        merged = install.merge_hooks(hooks)
        merged_again = install.merge_hooks(merged)

        assert merged_again["Stop"].count(foreign) == 1
        notifyhub_entries = [group for group in merged_again["Stop"] if install.is_ours(group)]
        assert len(notifyhub_entries) == 1
        assert "request_user_input" in merged_again["PreToolUse"][0]["matcher"]

        stripped = install.strip_hooks(merged_again)
        assert stripped["Stop"] == [foreign]
        assert "PreToolUse" not in stripped

    def test_merge_replaces_ours_in_place_so_trust_keys_do_not_move(self):
        ours = install.HOOK_EVENTS["Stop"][0]
        before = {"hooks": [{"type": "command", "command": "echo before"}]}
        after = {"hooks": [{"type": "command", "command": "echo after"}]}

        first = install.merge_hooks({"Stop": [before, ours]})
        second = install.merge_hooks({"Stop": [before, ours, after]})

        assert [group["hooks"][0]["command"] for group in first["Stop"]] == [
            "echo before",
            install.HOOK_EVENTS["Stop"][0]["hooks"][0]["command"],
        ]
        assert [group["hooks"][0]["command"] for group in second["Stop"]] == [
            "echo before",
            install.HOOK_EVENTS["Stop"][0]["hooks"][0]["command"],
            "echo after",
        ]

    def test_installed_handler_points_at_the_repo_script(self):
        handler = install.HOOK_EVENTS["Stop"][0]["hooks"][0]
        assert install.HOOK_MARKER in handler["command"]
        assert install.HOOK_MARKER in handler["commandWindows"]

    def test_completion_hooks_are_sync_so_codex_exec_does_not_cancel_them(self):
        for event in ("Stop", "Interrupt", "PostModelRequest"):
            assert install.HOOK_EVENTS[event][0]["hooks"][0]["async"] is False
        for event in ("PermissionRequest", "PreToolUse"):
            assert install.HOOK_EVENTS[event][0]["hooks"][0]["async"] is True

    def test_installer_writes_and_removes_hooks_json(self, tmp_path):
        codex_home = tmp_path / "codex"
        codex_home.mkdir()
        (codex_home / "hooks.json").write_text(
            json.dumps({"description": "mine", "hooks": {"Stop": [{"hooks": [{"type": "command", "command": "echo foreign"}]}]}}),
            encoding="utf-8",
        )
        env = {**os.environ, "CODEX_HOME": str(codex_home)}
        subprocess.run([sys.executable, str(PLUGIN_DIR / "install.py")], env=env, check=True, capture_output=True)
        data = json.loads((codex_home / "hooks.json").read_text(encoding="utf-8"))
        assert data["description"] == "mine"
        assert any(install.is_ours(group) for group in data["hooks"]["Stop"])

        subprocess.run(
            [sys.executable, str(PLUGIN_DIR / "install.py"), "--remove"],
            env=env,
            check=True,
            capture_output=True,
        )
        data = json.loads((codex_home / "hooks.json").read_text(encoding="utf-8"))
        assert data == {
            "description": "mine",
            "hooks": {"Stop": [{"hooks": [{"type": "command", "command": "echo foreign"}]}]},
        }

    def test_inline_config_hooks_are_detected(self, tmp_path, monkeypatch):
        codex_home = tmp_path / "codex"
        codex_home.mkdir()
        (codex_home / "config.toml").write_text("[[hooks.Stop]]\n", encoding="utf-8")
        monkeypatch.setenv("CODEX_HOME", str(codex_home))
        assert install.has_inline_config_hooks() is True

        (codex_home / "config.toml").write_text('model = "gpt"\n', encoding="utf-8")
        assert install.has_inline_config_hooks() is False

        # Codex's own trust bookkeeping is not an inline hook definition.
        (codex_home / "config.toml").write_text(
            '[hooks.state."/home/me/.codex/hooks.json:stop:0:0"]\ntrusted_hash = "sha256:x"\n',
            encoding="utf-8",
        )
        assert install.has_inline_config_hooks() is False


class TestPluginLayout:

    def test_plugin_hooks_json_is_valid_and_uses_plugin_root(self):
        data = json.loads((PLUGIN_DIR / "hooks" / "hooks.json").read_text(encoding="utf-8"))
        assert set(data["hooks"]) == {
            "Stop",
            "Interrupt",
            "PostModelRequest",
            "PermissionRequest",
            "PreToolUse",
            "UserPromptSubmit",
        }
        assert "${PLUGIN_ROOT}/notifyhub-codex.py" in data["hooks"]["Stop"][0]["hooks"][0]["command"]
        # Turn start reports + heartbeat watcher go through the python hook.
        handler = data["hooks"]["UserPromptSubmit"][0]["hooks"][0]
        assert "${PLUGIN_ROOT}/notifyhub-codex.py" in handler["command"]
        assert handler["async"] is True
        assert "curl" not in handler["command"]
        assert "notifyhub-codex.py" in handler["commandWindows"]

    def test_plugin_manifest_points_at_hooks(self):
        data = json.loads(
            (PLUGIN_DIR / ".codex-plugin" / "plugin.json").read_text(encoding="utf-8")
        )
        assert data["name"] == "notifyhub"
        assert data["hooks"] == "./hooks/hooks.json"
