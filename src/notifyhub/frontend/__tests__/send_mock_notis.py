#!/usr/bin/env python3

import argparse
import json
import os
import random
import sys
import time
import typing as tp
from datetime import datetime

import requests
from mini_logger import getLogger

# Add the script's directory to sys.path to import mock_data
sys.path.insert(0, os.path.dirname(__file__))

from mock_data import MOCK_NOTIFICATIONS

# Create logger
logger = getLogger("send_mock_notis.py", log_time=True)
# Customize formatter to match original format
import logging

for handler in logger.handlers:
    if isinstance(handler, logging.StreamHandler):
        handler.setFormatter(
            logging.Formatter("%(asctime)s [%(levelname)s] %(message)s")
        )


def main() -> None:
    # Parse command line arguments
    parser = argparse.ArgumentParser(
        description="Send mock notifications to the NotifyHub backend",
    )
    parser.add_argument(
        "number",
        type=int,
        nargs="?",
        default=3,
        help="Number of mock notifications to send (default: 3)",
    )
    parser.add_argument(
        "--random",
        action="store_true",
        help="Send notifications in random order (default: sequential)",
    )

    args = parser.parse_args()

    num_to_send = args.number
    if num_to_send <= 0:
        parser.error("number must be positive")

    random_mode = args.random

    logger.info(f"Sending {num_to_send} mock notifications")

    # Log mock data state
    logger.debug("Available mock notifications:")
    for i, noti in enumerate(MOCK_NOTIFICATIONS):
        logger.debug(f"\t[{i}]: {noti}")

    # Select notifications
    if random_mode:
        selected = random.choices(MOCK_NOTIFICATIONS, k=num_to_send)
    else:
        selected = (
            MOCK_NOTIFICATIONS * ((num_to_send - 1) // len(MOCK_NOTIFICATIONS) + 1)
        )[:num_to_send]

    logger.info(f"Selected {len(selected)} notifications for creation:")
    for i, noti in enumerate(selected, 1):
        logger.info(f"\t\t{i}\t{noti}")

    start_time = time.time()
    created_count = 0
    notification_ids: tp.List[str] = []

    # Process each selected notification
    for noti in selected:
        iteration_start = time.time()
        logger.debug(f"Processing notification: {noti}")

        # Validate dict (mock data is already parsed)
        if not isinstance(noti, dict):
            logger.error(f"Invalid mock notification format: {noti}")
            continue

        # Send POST request
        try:
            response = requests.post(
                "http://localhost:9080/api/notify",
                json={"data": noti},
                timeout=10,
            )
            response.raise_for_status()
            data = response.json()
        except Exception as e:
            logger.error(f"Failed to create notification: {e}")
            continue

        logger.debug(f"API response: {data}")

        # Parse ID
        noti_id = data.get("id")
        if not noti_id:
            logger.error(f"Invalid ID received: '{noti_id}' for notification: {noti}")
            logger.debug(f"Full response: {data}")
            continue

        notification_ids.append(noti_id)
        created_count += 1

        iteration_end = time.time()
        iteration_duration = int(iteration_end - iteration_start)

        logger.info(
            f"Successfully added notification with ID: {noti_id} ({iteration_duration}s)"
        )

    end_time = time.time()
    duration = int(end_time - start_time)

    logger.info(f"Fixture creation completed in {duration}s")
    logger.info(f"Results: {created_count} notifications created")

    # Output the IDs for potential use
    if notification_ids:
        logger.info("Created notification IDs:")
        for noti_id in notification_ids:
            logger.info(f"\t{noti_id}")


if __name__ == "__main__":
    main()
