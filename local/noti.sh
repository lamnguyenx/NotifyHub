#!/bin/bash

set -Eeuo pipefaile

function noti() {
	local message="${@:-Done}"
	local port="${NOTI_PORT:-9080}"
	local json_data
	json_data=$(printf '{"pwd":"%s","message":"%s"}' "$PWD" "$message")
	python -m notifyhub.cli --port "$port" "$json_data"
}

noti $@
