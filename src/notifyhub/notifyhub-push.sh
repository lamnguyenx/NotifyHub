#!/bin/bash

# Default values
DEFAULT_HOST=${NOTIFYHUB_HOST:-localhost}
DEFAULT_PORT=${NOTIFYHUB_PORT:-${NOTI_PORT:-9080}}
NOTIFYHUB_ADDRESS=${NOTIFYHUB_ADDRESS:-http://${DEFAULT_HOST}:${DEFAULT_PORT}}
NOTIFYHUB_ADDRESS=${NOTIFYHUB_ADDRESS%/}
NOTIFYHUB_HTTP_PROXY=${NOTIFYHUB_HTTP_PROXY:-}
VERBOSE_INT=${VERBOSE_INT:-1}

# Generate message from environment
MESSAGE="${HOST_ID:-HOST_ID} (opencode)"
JSON_DATA=$(printf '{"pwd":"%s","message":"%s"}' "$PWD" "$MESSAGE")

# Send notification
PAYLOAD=$(jq -n --argjson data "$JSON_DATA" '{"data": $data}')
CURL_OPTS="-s -X POST"
if [ -n "$NOTIFYHUB_HTTP_PROXY" ]; then
	CURL_OPTS="$CURL_OPTS -x $NOTIFYHUB_HTTP_PROXY"
fi
RESPONSE=$(curl $CURL_OPTS "$NOTIFYHUB_ADDRESS/api/notify" \
	-H "Content-Type: application/json" \
	-d "$PAYLOAD")

# Check for curl errors
if [ $? -ne 0 ]; then
	echo "✗ Network error: Failed to connect to $NOTIFYHUB_ADDRESS"
	exit 1
fi

# Parse response
if echo "$RESPONSE" | jq -e '.success' >/dev/null 2>&1; then
	if [ "$VERBOSE_INT" != "0" ]; then
		echo "✓ Notification sent successfully"
	fi
	exit 0
elif echo "$RESPONSE" | jq -e '.error' >/dev/null 2>&1; then
	echo "✗ Backend validation error:"
	echo "$RESPONSE" | jq -r '.error[]'
	exit 1
else
	echo "✗ Unexpected response: $RESPONSE"
	exit 1
fi
