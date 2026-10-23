#!/usr/bin/env python3
"""Install / uninstall the NotifyHub hooks for Claude Code.

Claude Code hooks live in JSON settings files (~/.claude/settings.json = all
projects). This script merges the NotifyHub hook entries into the existing
file without touching anything else, and can remove them again:

  python3 install.py             # merge hooks into ~/.claude/settings.json
  python3 install.py --dry-run   # show the would-be result, change nothing
  python3 install.py --remove    # strip the NotifyHub entries

The alternative distribution path is the plugin layout in this directory
(.claude-plugin/plugin.json + hooks/hooks.json): drop the folder into a
marketplace or load it with `claude --plugin-dir` and no settings edit is
needed. This installer exists because a plain settings merge is the smallest
step for a single machine.

The hook payload is built by notifyhub-claude.py, which spawns
notifyhub-push.py (the NotifyHub CLI) — the same push path the OpenCode plugin
uses. Install the CLI once via `make install-plugin` (OpenCode target) or set
NOTIFYHUB_PUSH_SCRIPT.
"""

import argparse
import json
import os
import sys
import typing as tp

PLUGIN_DIR = os.path.dirname(os.path.abspath(__file__))
HOOK_SCRIPT = os.path.join(PLUGIN_DIR, "notifyhub-claude.py")
SETTINGS_PATH = os.path.expanduser(os.path.join("~", ".claude", "settings.json"))

# Marker: uninstall matches hook entries whose command points at this
# directory's notifyhub-claude.py, so foreign "Stop" hooks stay untouched.
HOOK_MARKER = "notifyhub-claude.py"

HOOK_EVENTS: tp.Dict[str, tp.List[tp.Dict[str, tp.Any]]] = {
    # Turn finished (success or user interrupt) — the OpenCode plugin's
    # session.execution.succeeded counterpart. async: spawn without blocking
    # the UI; the script never writes stdout so it cannot alter the turn.
    "Stop": [
        {
            "hooks": [
                {"type": "command", "command": HOOK_SCRIPT, "args": [], "async": True}
            ]
        }
    ],
    # Turn ended on an API error — session.execution.failed counterpart.
    "StopFailure": [
        {
            "hooks": [
                {"type": "command", "command": HOOK_SCRIPT, "args": [], "async": True}
            ]
        }
    ],
    # Waiting on the user — permission.asked / form.created counterparts.
    # permission_prompt is gated ~6s by Claude Code ("appear away"), which is
    # arguably better UX than OpenCode's immediate ping; PermissionRequest
    # gives an immediate variant if you want it (see README).
    "Notification": [
        {
            "matcher": "permission_prompt|elicitation_dialog|elicitation_url_dialog|agent_needs_input",
            "hooks": [
                {"type": "command", "command": HOOK_SCRIPT, "args": [], "async": True}
            ],
        }
    ],
}


def is_ours(entry: tp.Dict[str, tp.Any]) -> bool:
    for hook in entry.get("hooks", []):
        if HOOK_MARKER in str(hook.get("command", "")):
            return True
    return False


def merge_hooks(hooks: tp.Dict[str, tp.List[tp.Any]]) -> tp.Dict[str, tp.List[tp.Any]]:
    for event, groups in HOOK_EVENTS.items():
        existing = hooks.setdefault(event, [])
        # Replace our previous entries, keep everyone else's.
        hooks[event] = [g for g in existing if not is_ours(g)] + groups
    return hooks


def strip_hooks(hooks: tp.Dict[str, tp.List[tp.Any]]) -> tp.Dict[str, tp.List[tp.Any]]:
    for event in list(hooks):
        kept = [g for g in hooks[event] if not is_ours(g)]
        if kept:
            hooks[event] = kept
        else:
            del hooks[event]  # drop the key entirely when nothing remains
    return hooks


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--dry-run", action="store_true", help="print the result, write nothing")
    parser.add_argument("--remove", action="store_true", help="uninstall the NotifyHub hooks")
    args = parser.parse_args()

    settings: tp.Dict[str, tp.Any] = {}
    if os.path.exists(SETTINGS_PATH):
        try:
            with open(SETTINGS_PATH, encoding="utf-8") as fh:
                settings = json.load(fh)
        except (OSError, json.JSONDecodeError) as error:
            print(f"✗ Cannot parse {SETTINGS_PATH}: {error}", file=sys.stderr)
            return 1

    hooks = settings.get("hooks") or {}
    hooks = strip_hooks(hooks) if args.remove else merge_hooks(hooks)
    if hooks:
        settings["hooks"] = hooks
    else:
        settings.pop("hooks", None)

    result = json.dumps(settings, indent=2, ensure_ascii=False) + "\n"
    if args.dry_run:
        print(f"# would write {SETTINGS_PATH}:")
        print(result, end="")
        return 0

    os.makedirs(os.path.dirname(SETTINGS_PATH), exist_ok=True)
    with open(SETTINGS_PATH, "w", encoding="utf-8") as fh:
        fh.write(result)

    action = "removed" if args.remove else "installed"
    print(f"✓ NotifyHub hooks {action} in {SETTINGS_PATH}")
    if not args.remove:
        print("  Restart running Claude Code sessions, or run /hooks in one to verify.")
        if not os.access(HOOK_SCRIPT, os.X_OK):
            print(f"  Note: {HOOK_SCRIPT} is not executable; run: chmod +x {HOOK_SCRIPT}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
