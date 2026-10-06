"""AES-256-GCM payload encryption for NotifyHub.

Wire/storage envelope (the opaque ``data`` field of a notification)::

    {
        "e2e": 1,
        "alg": "A256GCM",
        "kid": "a1b2c3d4",          # first 8 hex chars of sha256(key)
        "iv":  "<base64, 12 bytes>",
        "ct":  "<base64, ciphertext||16-byte GCM tag>"
    }

- Plaintext inside ``ct`` is UTF-8 JSON of the original payload dict
  (``message``, ``pwd``, ``host_model``, extras).
- AAD is the constant ``b"notifyhub:v1"`` for domain separation.
- A fresh random 96-bit IV is drawn per encryption and never reused.

Model: shared pre-shared key. The server holds it (decrypts at ingest for
tag matching + push), but stores and serves only the envelope. Consumers
(the TUI) hold the same key and decrypt locally.

Key resolution order (see :func:`load_key`):

1. ``e2e.key`` config value (config file / ``NOTIFYHUB_E2E_KEY`` env via confstack)
2. key file: ``NOTIFYHUB_E2E_KEY_FILE`` or ``~/.config/notifyhub/e2e.key``
3. keychain: macOS ``security`` or ``secret-tool`` (service ``notifyhub_e2e_key``)

Usage::

    python -m notifyhub.crypto --gen-key
    python -m notifyhub.crypto --gen-key --out ~/.config/notifyhub/e2e.key
    python -m notifyhub.crypto --key-id "$NOTIFYHUB_E2E_KEY"
"""

from __future__ import annotations

import argparse
import base64
import hashlib
import json
import logging
import os
import secrets
import subprocess
import typing as tp

from cryptography.exceptions import InvalidTag
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

AAD = b"notifyhub:v1"
ALG = "A256GCM"
ENVELOPE_VERSION = 1
IV_BYTES = 12
KEY_BYTES = 32
KEYCHAIN_SERVICE = "notifyhub_e2e_key"

logger = logging.getLogger(__name__)


class CryptoError(Exception):
    """Raised on invalid keys, malformed envelopes, or failed decryption."""


def generate_key() -> str:
    """Return a fresh random 256-bit key as base64."""
    return base64.b64encode(secrets.token_bytes(KEY_BYTES)).decode()


def normalize_key(key: str) -> bytes:
    """Accept base64- or hex-encoded 256-bit keys, return raw bytes."""
    if not isinstance(key, str):
        raise CryptoError("key must be a base64 or hex string")
    text = key.strip()
    try:
        raw: tp.Optional[bytes] = None
        if len(text) == KEY_BYTES * 2:
            try:
                raw = bytes.fromhex(text)
            except ValueError:
                raw = None
        if raw is None:
            raw = base64.b64decode(text, validate=True)
        if len(raw) != KEY_BYTES:
            raise CryptoError(
                f"key must decode to {KEY_BYTES} bytes, got {len(raw)}"
            )
        return raw
    except CryptoError:
        raise
    except Exception as exc:
        raise CryptoError(f"invalid key encoding: {exc}") from exc


def key_id(key: bytes) -> str:
    """Short non-reversible fingerprint of the key (for diagnostics)."""
    if not isinstance(key, (bytes, bytearray)) or len(key) != KEY_BYTES:
        raise CryptoError("key must be raw bytes")
    return hashlib.sha256(key).hexdigest()[:8]


def is_envelope(data: tp.Any) -> bool:
    """True if `data` looks like an e2e envelope (duck-typed, no decode)."""
    return (
        isinstance(data, dict)
        and data.get("e2e") == ENVELOPE_VERSION
        and data.get("alg") == ALG
        and isinstance(data.get("iv"), str)
        and isinstance(data.get("ct"), str)
    )


def encrypt_payload(payload: dict, key: bytes) -> dict:
    """Encrypt a payload dict into an envelope dict."""
    if not isinstance(payload, dict):
        raise CryptoError("payload must be a dict")
    key = _check_key(key)
    iv = secrets.token_bytes(IV_BYTES)
    plaintext = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    ct = AESGCM(key).encrypt(iv, plaintext, AAD)
    return {
        "e2e": ENVELOPE_VERSION,
        "alg": ALG,
        "kid": key_id(key),
        "iv": base64.b64encode(iv).decode(),
        "ct": base64.b64encode(ct).decode(),
    }


def decrypt_payload(envelope: dict, key: bytes) -> dict:
    """Decrypt an envelope back into the payload dict."""
    if not is_envelope(envelope):
        raise CryptoError("data is not an e2e envelope")
    key = _check_key(key)
    try:
        iv = base64.b64decode(envelope["iv"], validate=True)
        ct = base64.b64decode(envelope["ct"], validate=True)
    except Exception as exc:
        raise CryptoError(f"malformed envelope: bad base64 ({exc})") from exc
    try:
        plaintext = AESGCM(key).decrypt(iv, ct, AAD)
    except InvalidTag as exc:
        envelope_kid = envelope.get("kid")
        hint = f" (envelope kid={envelope_kid}, key kid={key_id(key)})" if envelope_kid else ""
        raise CryptoError(
            f"decryption failed: wrong key or tampered ciphertext{hint}"
        ) from exc
    except Exception as exc:
        raise CryptoError(f"decryption failed: {exc}") from exc
    try:
        payload = json.loads(plaintext.decode("utf-8"))
    except Exception as exc:
        raise CryptoError(f"decrypted payload is not valid JSON: {exc}") from exc
    if not isinstance(payload, dict):
        raise CryptoError("decrypted payload must be a JSON object")
    return payload


def _check_key(key: bytes) -> bytes:
    if not isinstance(key, (bytes, bytearray)) or len(key) != KEY_BYTES:
        raise CryptoError(f"key must be raw {KEY_BYTES} bytes")
    return bytes(key)


def load_key(configured: str = "") -> tp.Optional[bytes]:
    """Resolve the e2e key.

    Priority: explicit/config value (incl. ``NOTIFYHUB_E2E_KEY`` env via
    confstack) → key file → macOS keychain → Secret Service (``secret-tool``).
    Returns ``None`` when no key is available anywhere.
    """
    if configured:
        return normalize_key(configured)
    file_key = _read_key_file()
    if file_key:
        return normalize_key(file_key)
    key = _get_secret_from_keychain(KEYCHAIN_SERVICE)
    if key:
        return normalize_key(key)
    key = _get_secret_from_secret_service(KEYCHAIN_SERVICE)
    if key:
        return normalize_key(key)
    return None


def default_key_file_path() -> str:
    """Default key file location, shared with the TUI."""
    xdg = os.environ.get("XDG_CONFIG_HOME", "").strip()
    base = xdg or os.path.join(os.path.expanduser("~"), ".config")
    return os.path.join(base, "notifyhub", "e2e.key")


def _key_file_path() -> str:
    return os.environ.get("NOTIFYHUB_E2E_KEY_FILE", "").strip() or default_key_file_path()


def _read_key_file() -> tp.Optional[str]:
    path = _key_file_path()
    try:
        with open(path, "r", encoding="utf-8") as f:
            value = f.read().strip()
        return value or None
    except FileNotFoundError:
        return None
    except OSError as exc:
        logger.warning(f"could not read e2e key file {path!r}: {exc}")
        return None


def _config_key() -> str:
    """Read ``e2e.key`` from the app config file (JSON5), if present."""
    try:
        from confstack import confstackify

        from .config import NotifyHubConfig
    except Exception:
        return ""
    try:
        return (confstackify(NotifyHubConfig, "notifyhub").e2e.key or "").strip()
    except Exception:
        return ""


def _get_secret_from_keychain(service: str) -> tp.Optional[str]:
    try:
        result = subprocess.run(
            ["security", "find-generic-password", "-w", "-s", service],
            capture_output=True,
            text=True,
            timeout=5,
        )
        if result.returncode == 0 and result.stdout.strip():
            return result.stdout.strip()
    except FileNotFoundError:
        pass  # not on macOS
    except Exception as exc:
        logger.warning(f"keychain lookup for {service!r} failed: {exc}")
    return None


def _get_secret_from_secret_service(service: str) -> tp.Optional[str]:
    try:
        result = subprocess.run(
            ["secret-tool", "lookup", "service", service],
            capture_output=True,
            text=True,
            timeout=5,
        )
        if result.returncode == 0 and result.stdout.strip():
            return result.stdout.strip()
    except FileNotFoundError:
        pass  # secret-tool not installed
    except Exception as exc:
        logger.warning(f"secret-tool lookup for {service!r} failed: {exc}")
    return None


def key_status() -> str:
    """Human-readable key source + kid, without printing the secret."""
    env = os.environ.get("NOTIFYHUB_E2E_KEY", "").strip()
    if env:
        return _format_key_status("env NOTIFYHUB_E2E_KEY", env)

    configured = _config_key()
    if configured:
        return _format_key_status("config e2e.key", configured)

    file_val = _read_key_file()
    if file_val:
        return _format_key_status(f"file {_key_file_path()}", file_val)

    secret = _get_secret_from_keychain(KEYCHAIN_SERVICE) or _get_secret_from_secret_service(
        KEYCHAIN_SERVICE
    )
    if secret:
        return _format_key_status(f"keychain {KEYCHAIN_SERVICE}", secret)

    return (
        "e2e key: none "
        "(set NOTIFYHUB_E2E_KEY, add e2e.key to config.jsonl, write "
        "~/.config/notifyhub/e2e.key, or use keychain 'notifyhub_e2e_key')"
    )


def _format_key_status(source: str, value: str) -> str:
    try:
        return f"e2e key: {source} (kid {key_id(normalize_key(value))})"
    except CryptoError as exc:
        return f"e2e key: {source} INVALID ({exc})"


def main() -> None:
    parser = argparse.ArgumentParser(description="NotifyHub e2e crypto helpers")
    group = parser.add_mutually_exclusive_group()
    group.add_argument("--gen-key", action="store_true", help="print a fresh base64 key")
    group.add_argument("--key-id", metavar="KEY", help="print the kid of a key")
    group.add_argument("--status", action="store_true", help="print key source + kid (no secret)")
    parser.add_argument(
        "--out",
        metavar="PATH",
        help="with --gen-key, write the key to PATH",
    )
    parser.add_argument(
        "--write-default",
        action="store_true",
        help="with --gen-key, write to the default key file (~/.config/notifyhub/e2e.key, chmod 600)",
    )
    args = parser.parse_args()

    if args.gen_key:
        key = generate_key()
        out = args.out
        if args.write_default and not out:
            out = default_key_file_path()
        if out:
            write_key_file(os.path.expanduser(out), key)
            print(out)
        else:
            print(key)
    elif args.key_id:
        print(key_id(normalize_key(args.key_id)))
    elif args.status:
        print(key_status())
    else:
        parser.print_help()


def write_key_file(path: str, key: str) -> None:
    """Write a key file with 0600 permissions, creating parent dirs."""
    os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
    old_umask = os.umask(0o077)
    try:
        with open(path, "w", encoding="utf-8") as f:
            f.write(key.strip() + "\n")
    finally:
        os.umask(old_umask)
    os.chmod(path, 0o600)


if __name__ == "__main__":
    main()
