import subprocess
import json
import os

import pytest

CLI_SCRIPT = "src/notifyhub/cli/cli.py"


def clean_env() -> dict:
    """Environment without NOTIFYHUB_* variables, so the host shell cannot leak into tests."""
    return {k: v for k, v in os.environ.items() if not k.startswith("NOTIFYHUB")}


def run_cli(args, env_overrides=None, input=None):
    """Run the CLI as a subprocess with a sanitized environment."""
    env = clean_env() | (env_overrides or {})
    return subprocess.run(
        ["python", CLI_SCRIPT, *args],
        input=input,
        capture_output=True,
        text=True,
        cwd=os.getcwd(),
        env=env,
    )


def parse_payload(stdout: str) -> dict:
    payload_start = stdout.find("Payload: ") + len("Payload: ")
    return json.loads(stdout[payload_start:].strip())


def test_cli_dry_run_with_message():
    """--dry_run with a message argument."""
    result = run_cli(["--dry_run", "test message"])
    assert result.returncode == 0
    assert "Dry run: Would send notification to" in result.stdout
    payload = parse_payload(result.stdout)
    assert payload["data"]["message"] == "test message"
    assert "pwd" in payload["data"]


def test_cli_dry_run_with_stdin():
    """--dry_run with the message from stdin."""
    result = run_cli(["--dry_run"], input="stdin message")
    assert result.returncode == 0
    assert "Dry run: Would send notification to" in result.stdout
    payload = parse_payload(result.stdout)
    assert payload["data"]["message"] == "stdin message"
    assert "pwd" in payload["data"]


def test_cli_dry_run_with_custom_host_port():
    """--dry_run with custom host and port flags."""
    result = run_cli(
        ["--dry_run", "--host", "example.com", "--port", "8080", "custom message"]
    )
    assert result.returncode == 0
    assert "Dry run: Would send notification to http://example.com:8080" in result.stdout
    payload = parse_payload(result.stdout)
    assert payload["data"]["message"] == "custom message"


def test_cli_dry_run_with_default_host_port():
    """--dry_run without host/port flags uses the defaults."""
    result = run_cli(["--dry_run"])
    assert result.returncode == 0
    assert "Dry run: Would send notification to http://0.0.0.0:9080" in result.stdout


@pytest.mark.parametrize(
    "env_overrides",
    [
        {"NOTIFYHUB_CLI_HOST": ""},
        {"NOTIFYHUB_CLI_PORT": ""},
        {"NOTIFYHUB_CLI_HOST": "", "NOTIFYHUB_CLI_PORT": ""},
        {"NOTIFYHUB_CLI_HOST": " "},
        {"NOTIFYHUB_CLI_PORT": "  "},
    ],
    ids=["empty-host", "empty-port", "both", "blank-host", "blank-port"],
)
def test_cli_muted_by_empty_host_or_port(env_overrides):
    """Exported-empty host/port is the mute switch: silent exit 0."""
    result = run_cli(["--dry_run", "test message"], env_overrides=env_overrides)
    assert result.returncode == 0
    assert result.stdout == ""


def test_cli_empty_port_never_tracebacks():
    """Regression: NOTIFYHUB_CLI_PORT="" used to crash with a pydantic traceback."""
    result = run_cli(["--dry_run", "test"], env_overrides={"NOTIFYHUB_CLI_PORT": ""})
    assert result.returncode == 0
    assert "Traceback" not in result.stderr
    assert "ValidationError" not in result.stderr


@pytest.mark.parametrize(
    "false_value", ["false", "0", "off", "f", "n", "no", "FALSE", "No"]
)
def test_cli_muted_by_enabled_false(false_value):
    """NOTIFYHUB_CLI_ENABLED=<false-like> keeps the CLI silent and successful."""
    result = run_cli(
        ["--dry_run", "test message"],
        env_overrides={"NOTIFYHUB_CLI_ENABLED": false_value},
    )
    assert result.returncode == 0
    assert result.stdout == ""


@pytest.mark.parametrize("true_value", ["true", "1", "on", "t", "y", "yes", "", "T", " Y "])
def test_cli_enabled_true_or_empty_still_sends_dry_run(true_value):
    """NOTIFYHUB_CLI_ENABLED=<true-like or empty> leaves notifications enabled."""
    result = run_cli(
        ["--dry_run", "test message"],
        env_overrides={"NOTIFYHUB_CLI_ENABLED": true_value},
    )
    assert result.returncode == 0
    assert "Dry run: Would send notification to" in result.stdout


def test_cli_invalid_enabled_fails_cleanly():
    """An unparseable enabled value exits 1 with a clean message, not a traceback."""
    result = run_cli(
        ["--dry_run", "test message"],
        env_overrides={"NOTIFYHUB_CLI_ENABLED": "banana"},
    )
    assert result.returncode == 1
    assert "✗ Invalid config" in result.stdout
    assert "banana" in result.stdout
    assert "Traceback" not in result.stderr
