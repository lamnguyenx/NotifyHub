import base64
import json

import pytest

from notifyhub.crypto import (
    AAD,
    ALG,
    CryptoError,
    decrypt_payload,
    encrypt_payload,
    generate_key,
    is_envelope,
    key_id,
    key_status,
    normalize_key,
)

# ---------------------------------------------------------------------------
# Cross-language fixture (fixed key/iv/plaintext → ciphertext).
# The SAME constants are asserted in the TUI bun tests
# (src/notifyhub/tui/src/__tests__/crypto.test.ts) so Python-encrypt ⟷
# JS-decrypt compatibility is guaranteed by CI on both sides.
# ---------------------------------------------------------------------------
FIXTURE_KEY = bytes(range(32))
FIXTURE_KEY_B64 = "AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8="
FIXTURE_KID = "630dcd29"
FIXTURE_PAYLOAD = {
    "message": "[#tag:fixture] hello from cross-language fixture",
    "pwd": "/tmp/fixture",
    "host_model": "nuc",
}


class TestKeyHandling:
    def test_generate_key_round_trips(self):
        key_b64 = generate_key()
        assert key_b64 != generate_key()  # random per call
        raw = normalize_key(key_b64)
        assert len(raw) == 32

    def test_normalize_key_accepts_base64_and_hex(self):
        assert normalize_key(FIXTURE_KEY_B64) == FIXTURE_KEY
        assert normalize_key(FIXTURE_KEY.hex()) == FIXTURE_KEY

    def test_normalize_key_rejects_wrong_length(self):
        with pytest.raises(CryptoError):
            normalize_key(base64.b64encode(b"short").decode())

    def test_normalize_key_rejects_garbage(self):
        with pytest.raises(CryptoError):
            normalize_key("not a key!!")

    def test_key_id_is_stable_fingerprint(self):
        assert key_id(FIXTURE_KEY) == FIXTURE_KID
        assert len(key_id(FIXTURE_KEY)) == 8
        assert key_id(b"\x01" * 32) != FIXTURE_KID

    def test_key_id_rejects_bad_key(self):
        with pytest.raises(CryptoError):
            key_id(b"short")


class TestEnvelopeDetection:
    def test_detects_envelope(self):
        env = encrypt_payload(FIXTURE_PAYLOAD, FIXTURE_KEY)
        assert is_envelope(env) is True

    def test_rejects_plaintext_payload(self):
        assert is_envelope(FIXTURE_PAYLOAD) is False

    def test_rejects_non_dict(self):
        assert is_envelope(None) is False
        assert is_envelope("e2e") is False
        assert is_envelope([1, 2]) is False

    def test_rejects_wrong_alg_or_version(self):
        env = encrypt_payload(FIXTURE_PAYLOAD, FIXTURE_KEY)
        assert is_envelope({**env, "alg": "AES128CBC"}) is False
        assert is_envelope({**env, "e2e": 2}) is False


class TestEncryptDecrypt:
    def test_round_trip(self):
        env = encrypt_payload(FIXTURE_PAYLOAD, FIXTURE_KEY)
        assert decrypt_payload(env, FIXTURE_KEY) == FIXTURE_PAYLOAD

    def test_envelope_shape(self):
        env = encrypt_payload(FIXTURE_PAYLOAD, FIXTURE_KEY)
        assert env["e2e"] == 1
        assert env["alg"] == ALG
        assert env["kid"] == FIXTURE_KID
        # 12-byte IV, ciphertext = payload + 16-byte GCM tag
        assert len(base64.b64decode(env["iv"])) == 12
        ct = base64.b64decode(env["ct"])
        assert len(ct) >= len(json.dumps(FIXTURE_PAYLOAD)) + 16

    def test_fresh_iv_per_encryption(self):
        e1 = encrypt_payload(FIXTURE_PAYLOAD, FIXTURE_KEY)
        e2 = encrypt_payload(FIXTURE_PAYLOAD, FIXTURE_KEY)
        assert e1["iv"] != e2["iv"]
        assert e1["ct"] != e2["ct"]

    def test_unicode_round_trip(self):
        payload = {"message": "hello 👋 \nnewline — ünïcode", "pwd": "/tmp/ünïcode"}
        env = encrypt_payload(payload, FIXTURE_KEY)
        assert decrypt_payload(env, FIXTURE_KEY) == payload

    def test_wrong_key_fails(self):
        env = encrypt_payload(FIXTURE_PAYLOAD, FIXTURE_KEY)
        with pytest.raises(CryptoError, match="wrong key or tampered"):
            decrypt_payload(env, b"\x09" * 32)

    def test_tampered_ciphertext_fails(self):
        env = encrypt_payload(FIXTURE_PAYLOAD, FIXTURE_KEY)
        raw = bytearray(base64.b64decode(env["ct"]))
        raw[0] ^= 0xFF
        env["ct"] = base64.b64encode(bytes(raw)).decode()
        with pytest.raises(CryptoError):
            decrypt_payload(env, FIXTURE_KEY)

    def test_tampered_iv_fails(self):
        env = encrypt_payload(FIXTURE_PAYLOAD, FIXTURE_KEY)
        raw = bytearray(base64.b64decode(env["iv"]))
        raw[0] ^= 0xFF
        env["iv"] = base64.b64encode(bytes(raw)).decode()
        with pytest.raises(CryptoError):
            decrypt_payload(env, FIXTURE_KEY)

    def test_missing_aad_fails(self):
        # Must match the TUI: crypto.ts uses the same AAD constant.
        from cryptography.hazmat.primitives.ciphers.aead import AESGCM

        ct = AESGCM(FIXTURE_KEY).encrypt(b"\x00" * 12, b"{}", b"other-aad")
        env = {
            "e2e": 1,
            "alg": ALG,
            "kid": FIXTURE_KID,
            "iv": base64.b64encode(b"\x00" * 12).decode(),
            "ct": base64.b64encode(ct).decode(),
        }
        with pytest.raises(CryptoError):
            decrypt_payload(env, FIXTURE_KEY)
        assert AAD == b"notifyhub:v1"

    def test_malformed_base64_fails(self):
        env = encrypt_payload(FIXTURE_PAYLOAD, FIXTURE_KEY)
        env["ct"] = "!!!not-base64!!!"
        with pytest.raises(CryptoError, match="base64"):
            decrypt_payload(env, FIXTURE_KEY)

    def test_decrypt_rejects_non_envelope(self):
        with pytest.raises(CryptoError, match="not an e2e envelope"):
            decrypt_payload(FIXTURE_PAYLOAD, FIXTURE_KEY)

    def test_non_object_plaintext_rejected(self):
        from cryptography.hazmat.primitives.ciphers.aead import AESGCM

        ct = AESGCM(FIXTURE_KEY).encrypt(b"\x00" * 12, b"[1,2,3]", AAD)
        env = {
            "e2e": 1,
            "alg": ALG,
            "kid": FIXTURE_KID,
            "iv": base64.b64encode(b"\x00" * 12).decode(),
            "ct": base64.b64encode(ct).decode(),
        }
        with pytest.raises(CryptoError, match="JSON object"):
            decrypt_payload(env, FIXTURE_KEY)

    def test_encrypt_rejects_non_dict_payload(self):
        with pytest.raises(CryptoError):
            encrypt_payload("not a dict", FIXTURE_KEY)  # type: ignore[arg-type]


class TestKeyResolution:
    def test_load_key_from_file(self, tmp_path, monkeypatch):
        from notifyhub.crypto import load_key, write_key_file

        key_file = tmp_path / "e2e.key"
        key_file.write_text(FIXTURE_KEY_B64 + "\n")
        monkeypatch.delenv("NOTIFYHUB_E2E_KEY", raising=False)
        monkeypatch.setenv("NOTIFYHUB_E2E_KEY_FILE", str(key_file))

        assert load_key() == FIXTURE_KEY

    def test_configured_value_wins_over_file(self, tmp_path, monkeypatch):
        from notifyhub.crypto import load_key

        key_file = tmp_path / "e2e.key"
        key_file.write_text("CQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQk=\n")  # wrong key
        monkeypatch.setenv("NOTIFYHUB_E2E_KEY_FILE", str(key_file))

        assert load_key(FIXTURE_KEY_B64) == FIXTURE_KEY

    def test_missing_file_returns_none(self, tmp_path, monkeypatch):
        from notifyhub.crypto import load_key

        monkeypatch.delenv("NOTIFYHUB_E2E_KEY", raising=False)
        monkeypatch.delenv("NOTIFYHUB_E2E_KEY_FILE", raising=False)
        monkeypatch.setenv("XDG_CONFIG_HOME", str(tmp_path))
        # No keychain in CI either, so nothing resolves.
        monkeypatch.setattr("notifyhub.crypto._get_secret_from_keychain", lambda s: None)
        monkeypatch.setattr("notifyhub.crypto._get_secret_from_secret_service", lambda s: None)

        assert load_key() is None

    def test_default_key_file_path_honors_xdg(self, tmp_path, monkeypatch):
        from notifyhub.crypto import default_key_file_path

        monkeypatch.setenv("XDG_CONFIG_HOME", str(tmp_path))
        assert default_key_file_path() == str(tmp_path / "notifyhub" / "e2e.key")

    def test_write_key_file_sets_0600(self, tmp_path):
        import os
        import stat
        from notifyhub.crypto import write_key_file

        key_file = tmp_path / "nested" / "e2e.key"
        write_key_file(str(key_file), FIXTURE_KEY_B64)

        assert key_file.read_text().strip() == FIXTURE_KEY_B64
        mode = stat.S_IMODE(os.stat(key_file).st_mode)
        assert mode == 0o600


class TestKeyStatus:
    def test_reports_env_source(self, monkeypatch):
        monkeypatch.setenv("NOTIFYHUB_E2E_KEY", FIXTURE_KEY_B64)
        status = key_status()
        assert "env NOTIFYHUB_E2E_KEY" in status
        assert FIXTURE_KID in status

    def test_reports_config_source(self, monkeypatch):
        monkeypatch.delenv("NOTIFYHUB_E2E_KEY", raising=False)
        monkeypatch.setattr("notifyhub.crypto._config_key", lambda: FIXTURE_KEY_B64)
        status = key_status()
        assert "config e2e.key" in status
        assert FIXTURE_KID in status

    def test_reports_none(self, monkeypatch):
        monkeypatch.delenv("NOTIFYHUB_E2E_KEY", raising=False)
        monkeypatch.setattr("notifyhub.crypto._config_key", lambda: "")
        monkeypatch.setattr("notifyhub.crypto._read_key_file", lambda: None)
        monkeypatch.setattr("notifyhub.crypto._get_secret_from_keychain", lambda s: None)
        monkeypatch.setattr(
            "notifyhub.crypto._get_secret_from_secret_service", lambda s: None
        )
        assert "none" in key_status()

    def test_reports_invalid_key(self, monkeypatch):
        monkeypatch.setenv("NOTIFYHUB_E2E_KEY", "not-a-valid-key")
        assert "INVALID" in key_status()
