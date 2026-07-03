from __future__ import annotations

import asyncio
import logging
import subprocess
import time
import typing as tp

import requests

TELEGRAM_API_BASE = "https://api.telegram.org/bot{token}/{method}"

KEYCHAIN_SERVICE = "telegram-bot-token"
KEYCHAIN_ACCOUNT = "notifyhub"


def get_telegram_token(
    service: str = KEYCHAIN_SERVICE,
    account: str = KEYCHAIN_ACCOUNT,
) -> tp.Optional[str]:
    try:
        result = subprocess.run(
            ["security", "find-generic-password", "-w", "-a", account, "-s", service],
            capture_output=True,
            text=True,
            timeout=5,
        )
        if result.returncode == 0:
            token = result.stdout.strip()
            if token:
                return token
        logging.warning(
            "Telegram bot token not found in keychain "
            f"(service={service!r}, account={account!r})"
        )
    except FileNotFoundError:
        logging.warning("`security` CLI not found \u2014 not on macOS?")
    except subprocess.TimeoutExpired:
        logging.warning("Timed out reading Telegram token from keychain")
    except Exception as exc:
        logging.warning(f"Failed to read Telegram token from keychain: {exc}")
    return None


def send_telegram_message(
    token: str,
    chat_id: str,
    text: str,
    parse_mode: str = "HTML",
) -> bool:
    url = TELEGRAM_API_BASE.format(token=token, method="sendMessage")
    payload = {
        "chat_id": chat_id,
        "text": text,
        "parse_mode": parse_mode,
    }
    t0 = time.monotonic()
    try:
        resp = requests.post(url, json=payload, timeout=10)
        resp.raise_for_status()
        elapsed = time.monotonic() - t0
        logging.info(f"Telegram sendMessage took {elapsed*1000:.0f}ms")
        return True
    except Exception as exc:
        elapsed = time.monotonic() - t0
        logging.error(f"Telegram sendMessage failed after {elapsed*1000:.0f}ms: {exc}")
        return False


async def async_send_telegram_message(
    token: str,
    chat_id: str,
    text: str,
    parse_mode: str = "HTML",
) -> bool:
    return await asyncio.to_thread(
        send_telegram_message, token, chat_id, text, parse_mode
    )
