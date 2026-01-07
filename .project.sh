#!/bin/bash

export SWD=$(dirname "$(realpath "${BASH_SOURCE[0]}")")
export RIPGREP_CONFIG_PATH="$SWD/.ripgreprc"
