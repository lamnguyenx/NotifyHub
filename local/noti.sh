#!/bin/bash

set -Eeuo pipefail

function noti() {
	local message="${@:-Done}"
	local port="${NOTI_PORT:-9080}"
	local json_data
	json_data=$(printf '{"pwd":"%s","message":"%s"}' "$PWD" "$message")
	~/git/NotifyHub/src/notifyhub/notifyhub-push.sh "$json_data"
}

noti $@
