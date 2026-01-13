#!/bin/bash
# Version: 2025.12.15.01
# ==============================================================
#                         BACH LITE
# ==============================================================
# Lightweight script with archive and echo_banner functions
# Extracted from src/bach/ directory

# -----------------------------------
#            configuration
# -----------------------------------
ANSIFmt__reset='\033[00m'
ANSIFmt__red='\033[31m'
ANSIFmt__green='\033[32m'

# -----------------------------------
#            utilities
# -----------------------------------
# Determine the best date command for precision
if command -v gdate >/dev/null 2>&1; then
    DATE_CMD="gdate"
else
    DATE_CMD="date"
fi

function get_timeslug() {
    $DATE_CMD +"%Y.%m.%d__%Hh%Mm%Ss.%3N"
}

function echo_repeat() {
    local string="$1"
    local total_count="$2"
    printf "%${total_count}s\n" | sed "s| |$string|g"
}

function echo_center() {
    local message="$1"
    local room_len="$2"
    message_len=$(echo -n "$message" | wc -m)
    offset_len=$(echo "($room_len - $message_len) / 2" | bc)
    echo "$(echo_repeat " " $offset_len)$message"
}

function echo_green() { printf "$ANSIFmt__green$*$ANSIFmt__reset\n"; }
function echo_red() { printf "$ANSIFmt__red$*$ANSIFmt__reset\n"; }

# -----------------------------------
#            core functions
# -----------------------------------
function archive() {
    for source in "$@"; do
        timestamp="$(get_timeslug)"
        target="$(dirname "$source")/__archived__/$timestamp---$(basename "$source")"

        [[ ! -e "$source" ]] && {
            echo_green "[OK] Skipped"
            continue
        }

        [[ -e "$target" ]] && {
            echo_red "[ERROR] Detected pre-existing target: $target"
            continue
        }

        mkdir -p "$(dirname "$target")"
        mv "$source" "$target" || {
            echo_red "[ERROR] Something went wrong"
            echo_red "[ERROR] Perhaps due to file permission.."
        }

        echo_green "[OK] Archived '$source' --moved--> '$target'"
    done
}

function echo_banner() {
    local message="$1"
    local pattern="${2:-"-"}"
    local room_len="${3:-"60"}"
    echo_repeat "$pattern" $room_len
    echo_center "$message" $room_len
    echo_repeat "$pattern" $room_len
}

# -----------------------------------
#            main execution
# -----------------------------------
function usage() {
    echo "Usage: $0 <function> [args...]"
    echo "Available functions:"
    echo "  archive <files...>    Archive files with timestamp"
    echo "  echo_banner <msg> [pattern] [length]  Display formatted banner"
}

if [[ $# -eq 0 ]]; then
    usage
    exit 1
fi

func="$1"
shift

case "$func" in
archive)
    archive "$@"
    ;;
echo_banner)
    echo_banner "$@"
    ;;
*)
    echo "Error: Unknown function '$func'"
    usage
    exit 1
    ;;
esac
