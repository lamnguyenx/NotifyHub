# Storing Secrets for Bark Notifications

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