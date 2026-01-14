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
    address: str,
    payload: tp.Dict[str, tp.Any],
    proxy: str = "",
    verbose: int = 1,
) -> None:
    url = f"{address}/api/notify"
    headers = {"Content-Type": "application/json"}
    proxies = {"http": proxy, "https": proxy} if proxy else None

    try:
        response = requests.post(
            url=url,
            json=payload,
            headers=headers,
            proxies=proxies,
        )
        response.raise_for_status()
    except requests.RequestException:
        print(f"✗ Network error: Failed to connect to {address}")
        exit(1)

    # Parse response
    try:
        resp_json = response.json()
        if resp_json.get("success"):
            if verbose != 0:
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
    config = NotifyHubConfig.load_config(None)
    cli_config = config.cli
    DEFAULT_MESSAGE = "HOST_ID (opencode)"

    epilog_text = textwrap.dedent(
        """\
        Examples:
          ./%(prog)s "Hello World"
          echo "Build failed" | ./%(prog)s
          ./%(prog)s --host example.com --port 8080 "Custom message"
        """
    )

    parser = argparse.ArgumentParser(
        description="Send notification to NotifyHub server",
        epilog=epilog_text,
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument(
        "message",
        nargs="*",
        help="Notification message (reads from stdin if not provided)",
    )
    parser.add_argument(
        "--host",
        default=cli_config.host,
        help=f"NotifyHub host (default: {cli_config.host})",
    )
    parser.add_argument(
        "--port",
        type=int,
        default=cli_config.port,
        help=f"NotifyHub port (default: {cli_config.port})",
    )
    parser.add_argument(
        "--proxy",
        default=cli_config.proxy,
        help=f"HTTP proxy (default: {cli_config.proxy})",
    )
    parser.add_argument(
        "--verbose",
        type=int,
        default=cli_config.verbose,
        help=f"Verbosity level (default: {cli_config.verbose})",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Show what would be sent without actually sending",
    )

    args = parser.parse_args()

    # Determine message
    if args.message:
        MESSAGE = " ".join(args.message)
    else:
        MESSAGE = sys.stdin.read().strip() or DEFAULT_MESSAGE

    NOTIFYHUB_ADDRESS = os.getenv(
        "NOTIFYHUB_ADDRESS", f"http://{args.host}:{args.port}"
    ).rstrip("/")
    JSON_DATA = {"pwd": os.getcwd(), "message": MESSAGE}
    PAYLOAD = {"data": JSON_DATA}

    if args.dry_run:
        print("Dry run: Would send notification to", NOTIFYHUB_ADDRESS)
        print("Payload:", json.dumps(PAYLOAD, indent=2))
        exit(0)

    send_notification(
        address=NOTIFYHUB_ADDRESS,
        payload=PAYLOAD,
        proxy=args.proxy,
        verbose=args.verbose,
    )


if __name__ == "__main__":
    main()
