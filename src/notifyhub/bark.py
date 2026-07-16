from __future__ import annotations

import asyncio
import base64
import json
import logging
import os
import subprocess
import time
import typing as tp

import requests

BARK_API_URL = "https://api.day.app"
KEYCHAIN_SERVICE = "bark_noti_aes_key"
AES_INIT_VECTOR = "lamnguyenxiscomi"
DICEBEAR_ICON_URL = "https://api.dicebear.com/9.x/initials/jpg?seed={seed}&radius=50"


def get_bark_aes_key(
    service: str = KEYCHAIN_SERVICE,
    account: tp.Optional[str] = None,
) -> tp.Optional[str]:
    if account is None:
        account = os.environ.get("USER", "")
    try:
        result = subprocess.run(
            ["security", "find-generic-password", "-w", "-a", account, "-s", service],
            capture_output=True,
            text=True,
            timeout=5,
        )
        if result.returncode == 0:
            key = result.stdout.strip()
            if key:
                return key
        logging.warning(
            "Bark AES key not found in keychain "
            f"(service={service!r}, account={account!r})"
        )
    except FileNotFoundError:
        logging.warning("`security` CLI not found \u2014 not on macOS?")
    except subprocess.TimeoutExpired:
        logging.warning("Timed out reading Bark AES key from keychain")
    except Exception as exc:
        logging.warning(f"Failed to read Bark AES key from keychain: {exc}")
    return None


def _encrypt_payload(payload: str, aes_key: str, iv: str) -> str:
    key_hex = aes_key.encode().hex()
    iv_hex = iv.encode().hex()

    result = subprocess.run(
        ["openssl", "enc", "-aes-128-cbc", "-K", key_hex, "-iv", iv_hex],
        input=payload.encode(),
        capture_output=True,
        timeout=10,
    )
    if result.returncode != 0:
        raise RuntimeError(
            f"openssl encryption failed: {result.stderr.decode()}"
        )

    return base64.b64encode(result.stdout).decode()


def _get_dicebear_icon_url(seed: str) -> str:
    return DICEBEAR_ICON_URL.format(seed=seed)


def send_bark_notification(
    device_key: str,
    title: str,
    body: str,
    icon_url: str = "",
    aes_key: tp.Optional[str] = None,
    iv: str = AES_INIT_VECTOR,
) -> bool:
    if not aes_key:
        logging.warning("Bark AES key not available; skipping Bark notification")
        return False

    payload = {
        "title": title,
        "body": body,
    }
    if icon_url:
        payload["icon"] = icon_url

    json_payload = json.dumps(payload, ensure_ascii=False)
    ciphertext = _encrypt_payload(json_payload, aes_key, iv)
    iv_hex = iv.encode().hex()

    url = f"{BARK_API_URL}/{device_key}/Icon"

    t0 = time.monotonic()
    try:
        resp = requests.post(
            url,
            data={
                "ciphertext": ciphertext,
                "aes_init_vector": iv_hex,
            },
            timeout=10,
        )
        resp.raise_for_status()
        elapsed = time.monotonic() - t0
        logging.info(f"Bark push took {elapsed*1000:.0f}ms")
        return True
    except Exception as exc:
        elapsed = time.monotonic() - t0
        logging.error(f"Bark push failed after {elapsed*1000:.0f}ms: {exc}")
        return False


async def async_send_bark_notification(
    device_key: str,
    title: str,
    body: str,
    icon_url: str = "",
    aes_key: tp.Optional[str] = None,
    iv: str = AES_INIT_VECTOR,
) -> bool:
    return await asyncio.to_thread(
        send_bark_notification, device_key, title, body, icon_url, aes_key, iv
    )
