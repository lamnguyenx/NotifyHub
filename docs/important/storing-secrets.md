# Storing Secrets

How NotifyHub resolves its secrets: the **Bark AES key** (for encrypted push
payloads) and the **e2e encryption key** (for end-to-end payload encryption).

## Bark Notifications AES Key

The backend uses an AES key to encrypt Bark push notification payloads before sending them to the [Bark](https://github.com/Finb/Bark) iOS app.

## macOS — Keychain (via `security` CLI)

```bash
security add-generic-password -a "$USER" -s bark_noti_aes_key -w "YOUR_AES_KEY"
```

Retrieve:

```bash
security find-generic-password -w -a "$USER" -s bark_noti_aes_key
```

## Linux — Secret Service (via `secret-tool` CLI)

Requires `libsecret-tools`:

```bash
# Debian/Ubuntu
sudo apt install libsecret-tools

# Arch
sudo pacman -S libsecret
```

Store (the secret value is piped via stdin):

```bash
echo 'YOUR_AES_KEY' | secret-tool store --label='Bark AES key' service bark_noti_aes_key
```

Retrieve:

```bash
secret-tool lookup service bark_noti_aes_key
```

> **Note:** The first time you run `secret-tool store`, it may create a login keyring. On headless systems, pipe the key via stdin (as shown above) to avoid an interactive password prompt.

## How the Code Looks Up the Key

In `src/notifyhub/bark.py`, `get_bark_aes_key()` tries:

1. **macOS:** `security find-generic-password -w -a $USER -s bark_noti_aes_key`
2. **Linux fallback:** `secret-tool lookup service bark_noti_aes_key`

## E2E Encryption Key

The shared 256-bit AES-256-GCM key used for [end-to-end payload
encryption](e2e-encryption.md). For a consolidated setup, keep it beside the
other settings in `config.jsonl`:

```jsonc
"e2e": { "enabled": true, "key": "YOUR_KEY" }
```

The server and the TUI read it from the first source that has one:

| Source | Server | TUI |
|--------|:------:|:---:|
| `e2e.key` in `config.jsonl` / `config.json` | ✅ | ✅ |
| `NOTIFYHUB_E2E_KEY` env | ✅ | ✅ |
| key file (`NOTIFYHUB_E2E_KEY_FILE`, else `~/.config/notifyhub/e2e.key`) | ✅ | ✅ |
| keychain (`notifyhub_e2e_key`) | ✅ | — |

```bash
make e2e-status     # shows the resolved source + kid, never the key itself
# → e2e key: config e2e.key (kid 39163466)

make e2e-key        # fallback: generate a standalone ~/.config/notifyhub/e2e.key (0600)
```

The key is a 256-bit value, base64 or 64-char hex. Keychain storage is optional
and works like the Bark key, with service name `notifyhub_e2e_key`:

```bash
# macOS
security add-generic-password -a "$USER" -s notifyhub_e2e_key -w "YOUR_KEY"

# Linux
echo 'YOUR_KEY' | secret-tool store --label='NotifyHub e2e key' service notifyhub_e2e_key
```

> **Pitfall:** an **empty** env var still overrides the config. Only set
> `NOTIFYHUB_E2E_KEY` to a non-empty value when you intend to override.