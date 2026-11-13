#!/usr/bin/env python3
"""Install / uninstall the NotifyHub hooks for OpenAI Codex.

Codex loads lifecycle hooks from ~/.codex/hooks.json (and/or inline [hooks]
tables in ~/.codex/config.toml). This script merges the NotifyHub hook entries
into hooks.json without touching anything else, and can remove them again:

  python3 install.py             # merge hooks into ~/.codex/hooks.json
  python3 install.py --dry-run   # show the would-be result, change nothing
  python3 install.py --remove    # strip the NotifyHub entries

Set CODEX_HOME to install into a different Codex home (default ~/.codex).

Codex requires non-managed hooks to be reviewed and trusted before they run:
open /hooks in a Codex session and trust the NotifyHub entries. The hook
payload is built by notifyhub-codex.py, which spawns notifyhub-push.py (the
NotifyHub CLI) — the same push path the OpenCode and Claude Code integrations
use. Install the CLI once via `make install-plugin` (OpenCode target) or set
NOTIFYHUB_PUSH_SCRIPT.
"""

import argparse
import json
import os
import re
import shlex
import sys
import typing as tp

PLUGIN_DIR = os.path.dirname(os.path.abspath(__file__))
HOOK_SCRIPT = os.path.join(PLUGIN_DIR, "notifyhub-codex.py")

# Marker: uninstall matches hook entries whose command points at this
# directory's notifyhub-codex.py, so foreign hooks stay untouched.
HOOK_MARKER = "notifyhub-codex.py"

# Uninstall also matches the legacy curl status one-liners (which targeted
# this agent's status endpoint) so upgrades from that wiring clean up after
# themselves.
STATUS_HOOK_MARKER = "/api/status/codex/"


def codex_home() -> str:
    return os.environ.get("CODEX_HOME") or os.path.expanduser(os.path.join("~", ".codex"))


def hooks_path() -> str:
    return os.path.join(codex_home(), "hooks.json")


def config_path() -> str:
    return os.path.join(codex_home(), "config.toml")


def push_script_path() -> str:
    return os.environ.get("NOTIFYHUB_PUSH_SCRIPT") or os.path.expanduser(
        os.path.join("~", ".config", "opencode", "plugin", "notifyhub-push.py")
    )


def command_handler(timeout: float, async_: bool) -> tp.Dict[str, tp.Any]:
    return {
        "type": "command",
        "command": f"{shlex.quote(sys.executable)} {shlex.quote(HOOK_SCRIPT)}",
        "commandWindows": f'"{sys.executable}" "{HOOK_SCRIPT}"',
        "async": async_,
        "timeout": timeout,
    }


def status_curl_handler() -> tp.Dict[str, tp.Any]:
    """Legacy curl refresh, kept only for reference/uninstall matching.

    Current wiring reports `running` through notifyhub-codex.py (label
    precedence, prompt forwarding, and the --heartbeat watcher spawn), but
    existing installs may still carry this one-liner, so the shaped entry
    below remains the exact string the installer used to write.
    """
    return {
        "type": "command",
        # Codex may spawn hook commands without a shell, so the sh -c wrapper
        # guarantees env expansion rather than relying on the caller.
        "command": (
            "sh -c 'h=\"${NOTIFYHUB_CLI_HOST-127.0.0.1}\"; "
            "p=\"${NOTIFYHUB_CLI_PORT-9080}\"; "
            "s=\"${NOTIFYHUB_CLI_SCHEME-http}\"; "
            "m=\"${HOST_MODEL-}\"; "
            "m=\"${m#\"${m%%[![:space:]]*}\"}\"; m=\"${m%\"${m##*[![:space:]]}\"}\"; "
            "case \"$m\" in \"\"|Unknown) "
            "m=\"${HOSTNAME-}\"; "
            "m=\"${m#\"${m%%[![:space:]]*}\"}\"; m=\"${m%\"${m##*[![:space:]]}\"}\"; "
            "m=\"${m:-$(hostname)}\";; esac; "
            "[ -n \"$h\" ] && [ -n \"$p\" ] && "
            "curl -fsS -m 2 -X POST -H \"content-type: application/json\" "
            "-H \"x-notifyhub-host: $m\" "
            "--data-binary @- \"$s://$h:$p/api/status/codex/running\" "
            ">/dev/null 2>&1; exit 0'"
        ),
        # Use the Python reporter on Windows for the same label precedence.
        "commandWindows": command_handler(3, async_=True)["commandWindows"],
        "async": True,
        "timeout": 3,
    }


HOOK_EVENTS: tp.Dict[str, tp.List[tp.Dict[str, tp.Any]]] = {
    # Turn finished — the OpenCode plugin's session.execution.succeeded
    # counterpart. Synchronous: codex exec exits right after the turn and
    # cancels unfinished background hooks, so async would drop the push.
    "Stop": [{"hooks": [command_handler(10, async_=False)]}],
    # User interrupted an active turn. Codex caps Interrupt hooks at 3s.
    "Interrupt": [{"hooks": [command_handler(3, async_=False)]}],
    # A failed model request — the closest Codex equivalent of
    # session.execution.failed / StopFailure. Synchronous for the same reason;
    # the script dedupes per turn.
    "PostModelRequest": [{"hooks": [command_handler(10, async_=False)]}],
    # Codex is about to ask for approval. Returning no decision lets the
    # normal approval prompt continue; async so the prompt is not delayed.
    "PermissionRequest": [{"hooks": [command_handler(30, async_=True)]}],
    # The question tool (Plan mode by default; the
    # default_mode_request_user_input feature opens it in default mode).
    "PreToolUse": [
        {"matcher": "^request_user_input$", "hooks": [command_handler(30, async_=True)]}
    ],
    # Turn start → running. Report and spawn the --heartbeat watcher via the
    # Python hook: one prompt per turn is a cold path, the interpreter start
    # buys the label/prompt logic and the detached watcher that keeps long
    # turns fresh. Stop/Interrupt/PermissionRequest/PostModelRequest status
    # (idle/blocked/running) is posted by notifyhub-codex.py as well; the
    # legacy curl one-liner remains only for uninstall matching.
    "UserPromptSubmit": [{"hooks": [command_handler(10, async_=True)]}],
}


def is_ours(entry: tp.Any) -> bool:
    if not isinstance(entry, dict):
        return False
    hooks = entry.get("hooks")
    if not isinstance(hooks, list):
        return False
    for hook in hooks:
        if not isinstance(hook, dict):
            continue
        command = str(hook.get("command", ""))
        if HOOK_MARKER in command or STATUS_HOOK_MARKER in command:
            return True
    return False


def merge_hooks(hooks: tp.Dict[str, tp.List[tp.Any]]) -> tp.Dict[str, tp.List[tp.Any]]:
    for event, groups in HOOK_EVENTS.items():
        existing = hooks.get(event)
        existing = list(existing) if isinstance(existing, list) else []
        ours_at = [i for i, group in enumerate(existing) if is_ours(group)]
        if ours_at:
            # Replace in place: Codex's trust key includes the entry position,
            # so re-running the installer must not move an unchanged entry
            # behind hooks a user added later.
            insert_at = ours_at[0]
            existing = [group for group in existing if not is_ours(group)]
            existing[insert_at:insert_at] = groups
        else:
            existing.extend(groups)
        hooks[event] = existing
    return hooks


def strip_hooks(hooks: tp.Dict[str, tp.List[tp.Any]]) -> tp.Dict[str, tp.List[tp.Any]]:
    for event in list(hooks):
        groups = hooks[event]
        if not isinstance(groups, list):
            continue
        kept = [group for group in groups if not is_ours(group)]
        if kept:
            hooks[event] = kept
        else:
            del hooks[event]  # drop the key entirely when nothing remains
    return hooks


def has_inline_config_hooks() -> bool:
    """True when config.toml also has inline [hooks] tables. Codex merges both
    sources and prints a startup warning; we surface a gentler note instead."""
    try:
        with open(config_path(), encoding="utf-8", errors="replace") as fh:
            for line in fh:
                stripped = line.strip()
                # [hooks.state] is Codex's trust bookkeeping, not a hook
                # definition; it appears after the user trusts our entries.
                if stripped.startswith("[hooks.state") or stripped.startswith("[[hooks.state"):
                    continue
                if re.match(r"\[\[?hooks(?:\.|\])", stripped):
                    return True
    except OSError:
        pass
    return False


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--dry-run", action="store_true", help="print the result, write nothing")
    parser.add_argument("--remove", action="store_true", help="uninstall the NotifyHub hooks")
    args = parser.parse_args()

    path = hooks_path()
    if args.remove and not os.path.exists(path):
        print(f"✓ No NotifyHub hooks found in {path}")
        return 0

    data: tp.Dict[str, tp.Any] = {}
    if os.path.exists(path):
        try:
            with open(path, encoding="utf-8") as fh:
                loaded = json.load(fh)
            if not isinstance(loaded, dict):
                print(f"✗ {path} does not contain a JSON object", file=sys.stderr)
                return 1
            data = loaded
        except (OSError, json.JSONDecodeError) as error:
            print(f"✗ Cannot parse {path}: {error}", file=sys.stderr)
            return 1

    hooks = data.get("hooks")
    if hooks is None:
        hooks = {}
    if not isinstance(hooks, dict):
        print(f"✗ {path} has a non-object \"hooks\" value", file=sys.stderr)
        return 1
    hooks = strip_hooks(hooks) if args.remove else merge_hooks(hooks)
    if hooks:
        data["hooks"] = hooks
    else:
        data.pop("hooks", None)

    # A hooks.json containing only our entries should disappear completely on
    # uninstall; a user description or any foreign keys keep it alive.
    remove_file = bool(args.remove and not data.get("hooks") and set(data).issubset({"description"}))
    result = json.dumps(data, indent=2, ensure_ascii=False) + "\n"

    if args.dry_run:
        print(f"# would write {path}:")
        if remove_file:
            print("# (file would be removed)")
        else:
            print(result, end="")
        return 0

    if remove_file:
        try:
            os.remove(path)
        except FileNotFoundError:
            pass
        print(f"✓ NotifyHub hooks removed from {path} (file deleted)")
        return 0

    os.makedirs(os.path.dirname(path), exist_ok=True)
    temp_path = path + ".tmp"
    with open(temp_path, "w", encoding="utf-8") as fh:
        fh.write(result)
    os.replace(temp_path, path)

    action = "removed" if args.remove else "installed"
    print(f"✓ NotifyHub hooks {action} in {path}")
    if not args.remove:
        print("  Open /hooks in a Codex session and trust the NotifyHub entries before they run.")
        print("  If the hook definition changes, re-trust it from /hooks.")
        if has_inline_config_hooks():
            print(
                f"  Note: {config_path()} also defines [hooks]; Codex merges both sources "
                "and warns at startup."
            )
        push_script = push_script_path()
        if not os.path.exists(push_script):
            print(
                f"  Note: shared push script not found at {push_script}; run `make install-plugin` "
                "or set NOTIFYHUB_PUSH_SCRIPT."
            )
        if not os.access(HOOK_SCRIPT, os.X_OK):
            print(f"  Note: {HOOK_SCRIPT} is not executable; run: chmod +x {HOOK_SCRIPT}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
