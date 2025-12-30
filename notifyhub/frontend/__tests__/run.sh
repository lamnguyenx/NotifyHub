#!/bin/bash

# Script to run frontend tests for NotifyHub
# Usage: ./run.sh [dev|prod]
# dev: runs against dev server (port 9070)
# prod: runs against prod server (port 9080)

set -e

MODE="${1:-dev}"

if [ "$MODE" = "dev" ]; then
	export BASE_URL="http://localhost:9070"
elif [ "$MODE" = "prod" ]; then
	export BASE_URL="http://localhost:9080"
else
	echo "Usage: $0 [dev|prod]"
	exit 1
fi

# Get Chrome DevTools WebSocket endpoint
export CDP_WEBSOCKET_ENDPOINT=$(curl -s http://localhost:9222/json/version | jq -r .webSocketDebuggerUrl)

if [ -z "$CDP_WEBSOCKET_ENDPOINT" ] || [ "$CDP_WEBSOCKET_ENDPOINT" = "null" ]; then
	echo "Error: Could not get CDP WebSocket endpoint. Make sure Chrome is running with --remote-debugging-port=9222"
	exit 1
fi

echo "Running tests in $MODE mode"
echo "BASE_URL: $BASE_URL"
echo "CDP_WEBSOCKET_ENDPOINT: $CDP_WEBSOCKET_ENDPOINT"

# Check if notifications exist, add test fixtures if none
NOTIFICATION_COUNT=$(curl -s localhost:9080/api/notifications | jq length)
ADDED_FIXTURES=false
if [ "$NOTIFICATION_COUNT" -eq 0 ]; then
	echo "No pre-existing notifications, adding test fixtures..."
	python -m notifyhub.cli --port 9080 '{"message":"test-fixture-1"}'
	python -m notifyhub.cli --port 9080 '{"message":"test-fixture-2"}'
	ADDED_FIXTURES=true
fi

# Run Playwright tests
npx playwright test --headed

# Clean up test fixtures if added
if [ "$ADDED_FIXTURES" = true ]; then
	echo "Cleaning up test fixtures..."
	curl -s -X DELETE localhost:9080/api/notifications >/dev/null
fi
