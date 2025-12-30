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

# Add random test fixtures
MOCK_NOTIFICATIONS=(
	'{"message":"Build done","pwd":"/Users/test/NotifyHub"}'
	'{"message":"Tests pass","pwd":"/tmp/Test Project"}'
	'{"message":"Deploy ready","pwd":"/home/user/my-app"}'
	'{"message":"Lint fixed","pwd":"/projects/Foo Bar Baz"}'
	'{"message":"Code review","pwd":"/workspace/A"}'
)

echo "=== FIXTURE CREATION DIAGNOSTICS ==="
echo "$(date '+%Y-%m-%d %H:%M:%S') [DEBUG] Starting fixture creation"

# Log mock data state
echo "$(date '+%Y-%m-%d %H:%M:%S') [DEBUG] MOCK_NOTIFICATIONS array status:"
echo "  - Array size: ${#MOCK_NOTIFICATIONS[@]}"
if [ ${#MOCK_NOTIFICATIONS[@]} -gt 0 ]; then
	echo "  - Sample notifications (first 2):"
	for i in 0 1; do
		if [ $i -lt ${#MOCK_NOTIFICATIONS[@]} ]; then
			echo "    [$i]: ${MOCK_NOTIFICATIONS[$i]}"
		fi
	done
	if [ ${#MOCK_NOTIFICATIONS[@]} -gt 2 ]; then
		echo "    ... (${#MOCK_NOTIFICATIONS[@]} total)"
	fi
fi

echo "$(date '+%Y-%m-%d %H:%M:%S') [INFO] Selecting 3 random notifications for testing"
# Select 3 random notifications
SELECTED=$(printf '%s\n' "${MOCK_NOTIFICATIONS[@]}" | shuf -n 3)

echo "$(date '+%Y-%m-%d %H:%M:%S') [DEBUG] Selected notifications for creation:"
echo "$SELECTED" | nl -ba

fixture_start_time=$(date +%s)
created_count=0
NOTIFICATION_IDS=()

# Process each selected notification
while IFS= read -r noti; do
	[ -z "$noti" ] && continue # Skip empty lines

	iteration_start=$(date +%s)
	echo "$(date '+%Y-%m-%d %H:%M:%S') [DEBUG] Processing notification: $noti"

	# Validate JSON before sending
	if ! echo "$noti" | jq . >/dev/null 2>&1; then
		echo "$(date '+%Y-%m-%d %H:%M:%S') [ERROR] Invalid JSON in mock notification: $noti"
		continue
	fi

	# Use curl directly to get proper JSON response
	if ! response=$(curl -s -X POST localhost:9080/api/notify \
		-H "Content-Type: application/json" \
		-d "{\"data\":$noti}" 2>/dev/null); then
		echo "$(date '+%Y-%m-%d %H:%M:%S') [ERROR] curl command failed for notification: $noti"
		continue
	fi

	echo "$(date '+%Y-%m-%d %H:%M:%S') [DEBUG] API response: $response"

	# Parse ID safely
	if ! id=$(echo "$response" | jq -r '.id' 2>/dev/null); then
		echo "$(date '+%Y-%m-%d %H:%M:%S') [ERROR] Failed to parse ID from response: $response"
		continue
	fi

	echo "$(date '+%Y-%m-%d %H:%M:%S') [DEBUG] Parsed ID: '$id'"

	if [ "$id" = "null" ] || [ -z "$id" ]; then
		echo "$(date '+%Y-%m-%d %H:%M:%S') [ERROR] Invalid ID received: '$id' for notification: $noti"
		echo "$(date '+%Y-%m-%d %H:%M:%S') [DEBUG] Full response: $response"
		continue
	fi

	NOTIFICATION_IDS+=("$id")
	created_count=$((created_count + 1))

	iteration_end=$(date +%s)
	iteration_duration=$((iteration_end - iteration_start))

	echo "$(date '+%Y-%m-%d %H:%M:%S') [INFO] Successfully added notification with ID: $id (${iteration_duration}s)"
done <<<"$SELECTED"

fixture_end_time=$(date +%s)
fixture_duration=$((fixture_end_time - fixture_start_time))

echo "$(date '+%Y-%m-%d %H:%M:%S') [INFO] Fixture creation completed in ${fixture_duration}s"
echo "$(date '+%Y-%m-%d %H:%M:%S') [INFO] Results: $created_count notifications created"
echo "=== FIXTURE CREATION DIAGNOSTICS END ==="

# Run Playwright tests with environment variables
echo "$(date '+%Y-%m-%d %H:%M:%S') [INFO] Starting Playwright tests with CDP endpoint: $CDP_WEBSOCKET_ENDPOINT"
CDP_WEBSOCKET_ENDPOINT="$CDP_WEBSOCKET_ENDPOINT" npx playwright test --headed

# Clean up only the notifications we added
echo "=== CLEANUP DIAGNOSTICS ==="
echo "$(date '+%Y-%m-%d %H:%M:%S') [DEBUG] Starting cleanup of test fixtures"

# Log array state
echo "$(date '+%Y-%m-%d %H:%M:%S') [DEBUG] NOTIFICATION_IDS array status:"
echo "  - Array size: ${#NOTIFICATION_IDS[@]}"
echo "  - Empty status: $([ ${#NOTIFICATION_IDS[@]} -eq 0 ] && echo 'true' || echo 'false')"
if [ ${#NOTIFICATION_IDS[@]} -gt 0 ]; then
	echo "  - Sample IDs (first 3): ${NOTIFICATION_IDS[@]:0:3}"
	if [ ${#NOTIFICATION_IDS[@]} -gt 3 ]; then
		echo "    ... (${#NOTIFICATION_IDS[@]} total)"
	fi
fi

if [ ${#NOTIFICATION_IDS[@]} -eq 0 ]; then
	echo "$(date '+%Y-%m-%d %H:%M:%S') [ERROR] No notification IDs to clean up - array is empty"
	echo "This may indicate fixture creation failed or IDs were not captured properly"
	exit 1
fi

echo "$(date '+%Y-%m-%d %H:%M:%S') [INFO] Processing ${#NOTIFICATION_IDS[@]} notification IDs for cleanup"

deleted_count=0
failed_count=0
total_start_time=$(date +%s)

for i in "${!NOTIFICATION_IDS[@]}"; do
	id="${NOTIFICATION_IDS[$i]}"
	iteration_start=$(date +%s)

	# Progress logging at milestones
	total_items=${#NOTIFICATION_IDS[@]}
	progress_pct=$(((i + 1) * 100 / total_items))

	# Log at 25%, 50%, 75%, 100% or every 5 items for smaller sets
	if [ $progress_pct -eq 25 ] || [ $progress_pct -eq 50 ] || [ $progress_pct -eq 75 ] || [ $progress_pct -eq 100 ] || [ $total_items -le 10 ]; then
		echo "$(date '+%Y-%m-%d %H:%M:%S') [INFO] Cleanup progress: $((i + 1))/${total_items} (${progress_pct}%): processing ID=$id"
	fi

	echo "$(date '+%Y-%m-%d %H:%M:%S') [DEBUG] Attempting to delete notification ID: $id"

	# Execute curl with error handling
	if ! response=$(curl -s -w "\n%{http_code}" -X DELETE "localhost:9080/api/notifications?id=$id" 2>/dev/null); then
		echo "$(date '+%Y-%m-%d %H:%M:%S') [ERROR] curl command failed for ID $id"
		failed_count=$((failed_count + 1))
		continue
	fi

	# Parse response safely
	body=$(echo "$response" | head -n 1)
	http_code=$(echo "$response" | tail -n 1)

	# Validate HTTP code
	if ! echo "$http_code" | grep -q '^[0-9]\+$'; then
		echo "$(date '+%Y-%m-%d %H:%M:%S') [ERROR] Invalid HTTP code received: '$http_code' for ID $id"
		echo "$(date '+%Y-%m-%d %H:%M:%S') [DEBUG] Full response: '$response'"
		failed_count=$((failed_count + 1))
		continue
	fi

	iteration_end=$(date +%s)
	iteration_duration=$((iteration_end - iteration_start))

	if [ "$http_code" -eq 200 ]; then
		echo "$(date '+%Y-%m-%d %H:%M:%S') [INFO] Successfully deleted notification: $id (HTTP $http_code, ${iteration_duration}s)"
		deleted_count=$((deleted_count + 1))
	else
		echo "$(date '+%Y-%m-%d %H:%M:%S') [WARN] Failed to delete notification $id (HTTP $http_code, ${iteration_duration}s)"
		echo "$(date '+%Y-%m-%d %H:%M:%S') [DEBUG] Response body: '$body'"
		failed_count=$((failed_count + 1))
	fi
done

total_end_time=$(date +%s)
total_duration=$((total_end_time - total_start_time))

echo "$(date '+%Y-%m-%d %H:%M:%S') [INFO] Cleanup completed in ${total_duration}s"
echo "$(date '+%Y-%m-%d %H:%M:%S') [INFO] Results: $deleted_count successful, $failed_count failed"
echo "=== CLEANUP DIAGNOSTICS END ==="

# Exit with error if any deletions failed
if [ $failed_count -gt 0 ]; then
	echo "$(date '+%Y-%m-%d %H:%M:%S') [ERROR] Cleanup completed with $failed_count failures"
	exit 1
fi
