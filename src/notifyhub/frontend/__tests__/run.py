#!/usr/bin/env python3

import sys
import os
import json
import random
import subprocess
import time
import requests
from mini_logger import getLogger

from mock_data import MOCK_NOTIFICATIONS

# Create logger
logger = getLogger('run.py', log_time=True)



def run_cmd(cmd, capture_output=True, check=True):

    """Run a command and return the result"""
    try:
        result = subprocess.run(
            cmd, shell=True, capture_output=capture_output, text=True, check=check
        )
        return result.stdout.strip() if capture_output else None
    except subprocess.CalledProcessError as e:
        logger.error(f"Command failed: {cmd}")
        logger.error(f"Return code: {e.returncode}")
        if e.stdout:
            logger.debug(f"stdout: {e.stdout}")
        if e.stderr:
            logger.debug(f"stderr: {e.stderr}")
        raise



def main():

    # Parse command line arguments
    if len(sys.argv) > 1:
        mode = sys.argv[1]
    else:
        mode = "dev"

    if mode == "dev":
        base_url = "http://localhost:9070"
    elif mode == "prod":
        base_url = "http://localhost:9080"
    else:
        logger.error("Usage: python run.py [dev|prod]")
        sys.exit(1)

    # Set environment variables
    os.environ["BASE_URL"] = base_url

    # Get Chrome DevTools WebSocket endpoint
    try:
        response = requests.get("http://localhost:9222/json/version", timeout=5)
        response.raise_for_status()
        data = response.json()
        cdp_websocket_endpoint = data.get("webSocketDebuggerUrl")
    except Exception as e:
        logger.error(f"Could not get CDP WebSocket endpoint: {e}")
        logger.error("Make sure Chrome is running with --remote-debugging-port=9222")
        sys.exit(1)

    if not cdp_websocket_endpoint:
        logger.error(
            "Could not get CDP WebSocket endpoint. Make sure Chrome is running with --remote-debugging-port=9222"
        )
        sys.exit(1)

    os.environ["CDP_WEBSOCKET_ENDPOINT"] = cdp_websocket_endpoint

    logger.info(f"Running tests in {mode} mode")
    logger.info(f"BASE_URL: {base_url}")
    logger.info(f"CDP_WEBSOCKET_ENDPOINT: {cdp_websocket_endpoint}")

    logger.debug("Starting fixture creation")

    # Log mock data state
    logger.debug("MOCK_NOTIFICATIONS array status:")
    logger.debug(f"\t- Array size: {len(MOCK_NOTIFICATIONS)}")
    if MOCK_NOTIFICATIONS:
        logger.debug("\t- Sample notifications (first 2):")
        for i in range(min(2, len(MOCK_NOTIFICATIONS))):
            logger.debug(f"\t\t[{i}]: {MOCK_NOTIFICATIONS[i]}")
        if len(MOCK_NOTIFICATIONS) > 2:
            logger.debug(f"\t\t... ({len(MOCK_NOTIFICATIONS)} total)")

    logger.info("Selecting 3 random notifications for testing")
    # Select 3 random notifications
    selected = random.sample(MOCK_NOTIFICATIONS, 3)

    logger.debug("Selected notifications for creation:")
    for i, noti in enumerate(selected, 1):
        logger.debug(f"\t\t{i}\t{noti}")

    fixture_start_time = time.time()
    created_count      = 0
    notification_ids   = []

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
                "http://localhost:9080/api/notify", json={"data": noti}, timeout=10
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

        logger.info(f"Successfully added notification with ID: {noti_id} ({iteration_duration}s)")

    fixture_end_time = time.time()
    fixture_duration = int(fixture_end_time - fixture_start_time)

    logger.info(f"Fixture creation completed in {fixture_duration}s")
    logger.info(f"Results: {created_count} notifications created")

    # Run Playwright tests
    logger.info(f"Starting Playwright tests with CDP endpoint: {cdp_websocket_endpoint}")
    run_cmd("npx playwright test --headed", capture_output=False)

    # Clean up
    logger.debug("Starting cleanup of test fixtures")

    # Log array state
    logger.debug("NOTIFICATION_IDS array status:")
    logger.debug(f"\t- Array size: {len(notification_ids)}")
    empty_status = "true" if len(notification_ids) == 0 else "false"
    logger.debug(f"\t- Empty status: {empty_status}")
    if notification_ids:
        sample_ids = notification_ids[:3]
        logger.debug(f"\t- Sample IDs (first 3): {' '.join(sample_ids)}")
        if len(notification_ids) > 3:
            logger.debug(f"\t\t... ({len(notification_ids)} total)")

    if not notification_ids:
        logger.error("No notification IDs to clean up - array is empty")
        logger.error("This may indicate fixture creation failed or IDs were not captured properly")
        sys.exit(1)

    logger.info(f"Processing {len(notification_ids)} notification IDs for cleanup")

    deleted_count    = 0
    failed_count     = 0
    total_start_time = time.time()

    for i, noti_id in enumerate(notification_ids):
        iteration_start = time.time()

        # Progress logging
        total_items = len(notification_ids)
        progress_pct = (i + 1) * 100 // total_items

        # Log at milestones
        if progress_pct in [25, 50, 75, 100] or total_items <= 10:
            logger.info(
                f"Cleanup progress: {i + 1}/{total_items} ({progress_pct}%): processing ID={noti_id}"
            )

        logger.debug(f"Attempting to delete notification ID: {noti_id}")

        # Delete request
        try:
            response = requests.delete(
                f"http://localhost:9080/api/notifications?id={noti_id}", timeout=10
            )
            http_code = response.status_code
        except Exception as e:
            logger.error(f"Failed to delete notification {noti_id}: {e}")
            failed_count += 1
            continue

        iteration_end = time.time()
        iteration_duration = int(iteration_end - iteration_start)

        if http_code == 200:
            logger.info(
                f"Successfully deleted notification: {noti_id} (HTTP {http_code}, {iteration_duration}s)"
            )
            deleted_count += 1
        else:
            logger.warning(
                f"Failed to delete notification {noti_id} (HTTP {http_code}, {iteration_duration}s)"
            )
            logger.debug(f"Response body: '{response.text}'")
            failed_count += 1

    total_end_time = time.time()
    total_duration = int(total_end_time - total_start_time)

    logger.info(f"Cleanup completed in {total_duration}s")
    logger.info(f"Results: {deleted_count} successful, {failed_count} failed")

    # Exit with error if any deletions failed
    if failed_count > 0:
        logger.error(f"Cleanup completed with {failed_count} failures")
        sys.exit(1)



if __name__ == "__main__":
    main()
