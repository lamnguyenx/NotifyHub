#!/usr/bin/env python3

import argparse
import os
import sys
import textwrap
import json
import requests
import typing as tp

from notifyhub.config import NotifyHubConfig


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

    # Parse response
    try:
        resp_json = response.json()
        if resp_json.get("success"):
            if config.cli.verbose != 0:
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

    epilog_text = textwrap.dedent(
        """\
        Examples:
          ./%(prog)s "Hello World"
          echo "Build failed" | ./%(prog)s
          ./%(prog)s --host example.com --port 8080 "Custom message"
        """
    )

    parser = NotifyHubConfig.get_argparser()
    parser.description = "Send notification to NotifyHub server"
    parser.epilog = epilog_text
    parser.formatter_class = argparse.RawDescriptionHelpFormatter
    parser.add_argument(
        "message",
        nargs="*",
        help="Notification message (reads from stdin if not provided)",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Show what would be sent without actually sending",
    )

    args = parser.parse_args()
    config = NotifyHubConfig.load_config(cli_args=args)

    # Determine message
    if args.message:
        message = " ".join(args.message)
    else:
        message = sys.stdin.read().strip() or DEFAULT_MESSAGE

    json_data = {"pwd": os.getcwd(), "message": message}
    payload = {"data": json_data}

    if args.dry_run:
        print("Dry run: Would send notification to", config.cli.address)
        config.print_json()
        print("Payload:", json.dumps(payload, indent=2))
        exit(0)

    send_notification(
        config=config,
        payload=payload,
    )


if __name__ == "__main__":
    main()
