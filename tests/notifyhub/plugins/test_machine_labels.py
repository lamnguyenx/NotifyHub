import importlib.util
import json
import os
import subprocess
import sys
from pathlib import Path

import pytest


@pytest.fixture(params=["claude", "codex"])
def integration(request):
    plugin_dir = Path(__file__).resolve().parents[3] / "src/notifyhub/plugins" / request.param
    modules = []
    for filename in (f"notifyhub-{request.param}.py", "install.py"):
        spec = importlib.util.spec_from_file_location(f"label_{request.param}_{filename}", plugin_dir / filename)
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        modules.append(module)
    return plugin_dir, *modules


@pytest.mark.parametrize(
    "model,hostname,expected",
    [
        ("MS-7E70", "shell-host", "MS-7E70"),
        ("  MS-7E70 ", "shell-host", "MS-7E70"),
        ("Unknown", " shell-host ", "shell-host"),
        ("   ", "shell-host", "shell-host"),
        (None, None, "os-host"),
        (" Unknown ", "   ", "os-host"),
        ("label $(hostname)", "shell-host", "label $(hostname)"),
    ],
)
def test_status_machine_label_matches_completion_cli(integration, monkeypatch, tmp_path, model, hostname, expected):
    plugin_dir, hook, install = integration
    for key, value in (("HOST_MODEL", model), ("HOSTNAME", hostname)):
        if value is None:
            monkeypatch.delenv(key, raising=False)
        else:
            monkeypatch.setenv(key, value)
    monkeypatch.setattr(hook.socket, "gethostname", lambda: "os-host")
    monkeypatch.setenv("NOTIFYHUB_CLI_HOST", "127.0.0.1")
    monkeypatch.setenv("NOTIFYHUB_CLI_PORT", "9080")
    monkeypatch.setenv("NOTIFYHUB_CLI_ENABLED", "true")

    class Response:
        def __enter__(self):
            return self

        def __exit__(self, *args):
            pass

    bodies = []

    def capture_status(request, timeout):
        bodies.append(json.loads(request.data))
        return Response()

    monkeypatch.setattr(hook._DIRECT_OPENER, "open", capture_status)
    hook.post_status({"session_id": "label-test", "cwd": "/tmp"}, "blocked")
    assert bodies[0]["host"] == expected
    if plugin_dir.name == "codex":
        hook.post_status(
            {"session_id": "label-test", "hook_event_name": "UserPromptSubmit", "prompt": "new task"},
            "running",
        )
        assert bodies[-1]["host"] == expected
        assert bodies[-1]["prompt"] == "new task"

    # Exercise the real shell command, with a fake curl to capture its header
    # and stdin without a backend or any network traffic.
    capture = tmp_path / "curl.json"
    monkeypatch.setenv("CURL_CAPTURE", str(capture))
    monkeypatch.setenv("PATH", str(tmp_path) + os.pathsep + os.environ.get("PATH", ""))
    curl = tmp_path / "curl"
    curl.write_text(
        f"#!{sys.executable}\n"
        "import json, os, pathlib, sys\n"
        "pathlib.Path(os.environ['CURL_CAPTURE']).write_text("
        "json.dumps({'args': sys.argv[1:], 'body': sys.stdin.read()}))\n"
    )
    curl.chmod(0o755)
    host_command = tmp_path / "hostname"
    host_command.write_text("#!/bin/sh\nprintf '%s\\n' os-host\n")
    host_command.chmod(0o755)

    layout = json.loads((plugin_dir / "hooks" / "hooks.json").read_text())
    if plugin_dir.name == "claude":
        # The per-tool refresh remains the curl one-liner the handler builds.
        command = install.status_curl_handler()["command"]
        assert layout["hooks"]["PostToolUse"][0]["hooks"][0]["command"] == command
        payload = '{"session_id":"label-test","prompt":"keep raw stdin"}'
        subprocess.run(command, shell=True, input=payload, text=True, check=True)
        sent = json.loads(capture.read_text())
        assert f"x-notifyhub-host: {expected}" in sent["args"]
        assert sent["body"] == payload
    else:
        # Turn start goes through the python reporter (its labels were checked
        # above); no curl one-liner remains in the codex layout.
        handler = layout["hooks"]["UserPromptSubmit"][0]["hooks"][0]
        assert "notifyhub-codex.py" in handler["command"]
        assert "curl" not in handler["command"]
