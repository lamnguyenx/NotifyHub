import subprocess
import json
import os
import pytest


def test_cli_dry_run_with_message():
    """Test --dry-run with message argument."""
    result = subprocess.run(
        ["python", "src/notifyhub/cli/cli.py", "--dry-run", "test message"],
        capture_output=True,
        text=True,
        cwd=os.getcwd()
    )
    assert result.returncode == 0
    assert "Dry run: Would send notification to" in result.stdout
    assert "Payload:" in result.stdout
    # Parse the payload part
    payload_start = result.stdout.find("Payload: ") + len("Payload: ")
    payload_str = result.stdout[payload_start:].strip()
    payload = json.loads(payload_str)
    assert payload["data"]["message"] == "test message"
    assert "pwd" in payload["data"]


def test_cli_dry_run_with_stdin():
    """Test --dry-run with message from stdin."""
    result = subprocess.run(
        ["python", "src/notifyhub/cli/cli.py", "--dry-run"],
        input="stdin message",
        capture_output=True,
        text=True,
        cwd=os.getcwd()
    )
    assert result.returncode == 0
    assert "Dry run: Would send notification to" in result.stdout
    assert "Payload:" in result.stdout
    # Parse the payload part
    payload_start = result.stdout.find("Payload: ") + len("Payload: ")
    payload_str = result.stdout[payload_start:].strip()
    payload = json.loads(payload_str)
    assert payload["data"]["message"] == "stdin message"
    assert "pwd" in payload["data"]


def test_cli_dry_run_with_custom_host_port():
    """Test --dry-run with custom host and port."""
    env = {k: v for k, v in os.environ.items() if k != "NOTIFYHUB_ADDRESS"}
    result = subprocess.run(
        ["python", "src/notifyhub/cli/cli.py", "--dry-run", "--host", "example.com", "--port", "8080", "custom message"],
        capture_output=True,
        text=True,
        cwd=os.getcwd(),
        env=env
    )
    assert result.returncode == 0
    assert "Dry run: Would send notification to http://example.com:8080" in result.stdout
    assert "Payload:" in result.stdout
    # Parse the payload part
    payload_start = result.stdout.find("Payload: ") + len("Payload: ")
    payload_str = result.stdout[payload_start:].strip()
    payload = json.loads(payload_str)
    assert payload["data"]["message"] == "custom message"