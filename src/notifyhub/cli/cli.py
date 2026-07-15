#!/usr/bin/env python3

import os
import sys
import json
import typing as tp

import requests
from tap import Tap
from confstack import confstackify
from notifyhub.config import NotifyHubConfig

CLI_FIELDS = frozenset({"host", "port", "proxy", "verbose"})


class CliArgs(Tap):
    host: str = "0.0.0.0"
    port: int = 9080
    proxy: str = ""
    verbose: bool = False
    dry_run: bool = False


def send_notification(
    config: NotifyHubConfig,
    payload: tp.Dict[str, tp.Any],
) -> None:
    url = f"{config.cli.address}/api/notify"
    headers = {"Content-Type": "application/json"}
    proxies = (
        {"http": config.cli.proxy, "https": config.cli.proxy}
        if config.cli.proxy
        else None
    )

    try:
        response = requests.post(
            url=url,
            json=payload,
            headers=headers,
            proxies=proxies,
        )
        response.raise_for_status()
    except requests.RequestException:
        print(f"✗ Network error: Failed to connect to {config.cli.address}")
        exit(1)

    try:
        resp_json = response.json()
        if resp_json.get("success"):
            if config.cli.verbose:
                print("✓ Notification sent successfully")
            exit(0)
        elif "error" in resp_json:
            print("✗ Backend validation error:")
            for err in resp_json["error"]:
                print(err)
            exit(1)
        else:
            print(f"✗ Unexpected response: {response.text}")
            exit(1)
    except json.JSONDecodeError:
        print(f"✗ Unexpected response: {response.text}")
        exit(1)


def main() -> None:
    DEFAULT_MESSAGE = "HOST_ID (opencode)"

    cli = CliArgs(
        description="Send notification to NotifyHub server",
    ).parse_args(known_only=True)

    overrides = {
        "cli": {k: v for k, v in cli.as_dict().items() if k in CLI_FIELDS}
    }
    config = confstackify(NotifyHubConfig, "notifyhub", overrides=overrides)

    if cli.extra_args:
        message = " ".join(cli.extra_args)
    else:
        message = sys.stdin.read().strip() or DEFAULT_MESSAGE

    json_data = {"pwd": os.getcwd(), "message": message}
    payload = {"data": json_data}

    if cli.dry_run:
        print("Dry run: Would send notification to", config.cli.address)
        print(config.model_dump_json(indent=2))
        print("Payload:", json.dumps(payload, indent=2))
        exit(0)

    send_notification(
        config=config,
        payload=payload,
    )


if __name__ == "__main__":
    main()
