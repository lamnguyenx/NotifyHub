#!/usr/bin/env bash
#
# push-funnel-noti.sh — push a notification to a NotifyHub server from anywhere
# on the internet, over a Tailscale funnel (or any reachable HTTP(S) endpoint).
#
# Standalone: needs only `bash` and `curl` (no Python, no repo checkout).
#
# Usage:
#   ./push-funnel-noti.sh "build finished"
#   echo "deploy done" | ./push-funnel-noti.sh
#   NOTIFYHUB_URL=https://notify.example.com ./push-funnel-noti.sh "hello"
#
# Env:
#   NOTIFYHUB_URL   Base URL of the server (default: the public funnel below)
#   NOTIFYHUB_PWD   "pwd" field reported to the server (default: $PWD)
set -euo pipefail

URL="${NOTIFYHUB_URL:-https://nuc.tail0ec64c.ts.net}"

MESSAGE="${*:-}"
if [[ -z "$MESSAGE" && ! -t 0 ]]; then
  MESSAGE="$(cat)"
fi
MESSAGE="${MESSAGE:-NotifyHub ping}"
PWD_FIELD="${NOTIFYHUB_PWD:-$PWD}"

json_escape() {
  local s="$1"
  s="${s//\\/\\\\}"
  s="${s//\"/\\\"}"
  s="${s//$'\n'/\\n}"
  s="${s//$'\r'/\\r}"
  s="${s//$'\t'/\\t}"
  printf '%s' "$s"
}

payload=$(
  printf '{"data":{"message":"%s","pwd":"%s"}}' \
    "$(json_escape "$MESSAGE")" "$(json_escape "$PWD_FIELD")"
)

response=$(curl -fsS -X POST "${URL%/}/api/notify" \
  -H 'Content-Type: application/json' \
  -d "$payload")

# Surface backend validation errors (2xx with an "error" key) as a failure.
case "$response" in
  *'"error"'*)
    echo "notifyhub: server rejected the notification: $response" >&2
    exit 1
    ;;
esac

echo "$response"
