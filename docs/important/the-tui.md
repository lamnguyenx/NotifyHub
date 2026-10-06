# NotifyHub TUI

> Terminal User Interface for NotifyHub — a real-time notification client in your terminal.

## Overview

The TUI is a full-screen terminal application that connects to the NotifyHub backend to display, browse, and manage notifications in real time. Built with [OpenTUI](https://opentui.dev) (React bindings) + Bun.

## Architecture

```mermaid
graph TB
    TUI["Bun + OpenTUI
         LIVE Stream"]

    BACKEND["NotifyHub Backend (Port 9080)
            FastAPI + SSE + NotificationStore"]

    TUI -- SSE /events --> BACKEND
    TUI -- REST /api/... --> BACKEND
```

## Features

### 1. Live Notification Stream
The main view is a real-time scrolling feed of notifications received via SSE from the backend.
- Auto-scrolling feed (sticks to bottom)
- Receives `init` snapshot on connect, then live `notification` events
- Keyboard navigation: `j`/`k` or `↑`/`↓` to select individual cards
- Delete selected notification: `Delete` or `Backspace`
- Viewport culling for performance with large lists

### 2. Notification Cards
Each notification is rendered as a bordered card (rounded corners) with:

```
╭──────────────────────────────────────────────╮
│V VoiceAI_ASR                           @host │  ← colored avatar + bold title + host pill
│                                         time │  ← timestamp directly below host pill
│ /home/lamnt45/git/VoiceAI_ASR               │  ← full pwd path (dimmed)
│ @USER ok, but i also want to the…           │  ← message with tag highlighting
╰──────────────────────────────────────────────╯
```

- **Colored avatar initial** — derived from a hash of the pwd path (15-color palette matching the web UI)
- **App name** — last segment of the pwd path, bold white
- **Timestamp** — formatted as `HH:MM AM/PM`, sits on its own row beneath the host pill (or on the title row if no host_model)
- **Full pwd path** — dimmed gray
- **Host-model tag** — `@Mac153` pill at the top-right corner of the card, colored via FNV-1a hash of host_model string into 15-color palette, then **dimmed** to 40% strength against the card background (`mixHex(bright, cardBg, 0.4)`) so it's visually secondary to the avatar. Text uses `theme.text` for contrast in both light and dark modes.
- **Tag highlighting** — `[#tag:...]` rendered in gray, `[#truncated:...]` in dark gray
- **Selection** — highlighted border and background on the focused card

### 3. Status Popup
Press `s` to toggle a centered overlay showing:
- Connection status (`● Connected` / `○ Disconnected`) with host:port
- Total notification count
- SSE streaming status
- E2E status: server state + `kid`, whether a local key is set, and the locked-row count
- Dismisses on any key press

### 4. End-to-End Decryption
When the backend has [e2e encryption](e2e-encryption.md) enabled, payloads arrive
as AES-256-GCM envelopes and the TUI decrypts them locally (`utils/crypto.ts`,
WebCrypto). Cards that cannot be decrypted render as a `LOCKED` card showing the
envelope `kid`, so a wrong/missing key is obvious.

## Theme

High-contrast dark theme:

| Role | Color |
|------|-------|
| Page background | `#0a0a0a` |
| Card background | `#141414` |
| Card background (selected) | `#1e1e1e` |
| Card border | `#2a2a2a` |
| Card border (selected) | `#555555` |
| Title text | `#ffffff` bold |
| Body text | `#d4d4d4` |
| Dimmed text | `#888888` |
| Timestamp | `#999999` |
| Footer background | `#0d0d0d` |
| Popup background | `#111111` |

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `j` / `k` or `↑` / `↓` | Navigate notification list |
| `Delete` / `Backspace` | Delete selected notification |
| `s` | Toggle status popup |
| `q` | Quit the TUI |
| `Ctrl+C` | Quit (handled by renderer) |

## Project Structure

```
src/notifyhub/tui/
├── package.json              # Bun deps: @opentui/core, @opentui/react, react 19
├── tsconfig.json             # TypeScript + JSX config
├── src/
│   ├── index.tsx             # Entry point — creates CliRenderer, mounts App
│   ├── App.tsx               # Main layout, keyboard nav, popup management
│   ├── types.ts              # NotificationItem, NotificationData, ServerInfo, E2EInfo types
│   ├── utils/
│   │   ├── api.ts            # REST API client + SSE connection (manual parser)
│   │   └── crypto.ts         # AES-256-GCM envelope decryption (WebCrypto)
│   ├── hooks/
│   │   └── useNotifications.ts  # SSE subscription + notification state mgmt
│   └── components/
│       ├── NotificationStream.tsx   # Live auto-scrolling feed with nav
│       ├── NotificationRow.tsx      # Notification card renderer (+ LOCKED cards)
│       └── StatusPopup.tsx          # Centered status overlay
│
├── src/__tests__/            # bun test suites (utils, components, crypto)
```

## API Integration

### SSE Endpoint (`/events`)
The TUI connects to the SSE stream using the Fetch API + ReadableStream reader:
1. Sends `GET /events`
2. Parses SSE protocol manually (`event:` and `data:` fields with CRLF line endings)
3. Handles events: `init`, `notification`, `delete`, `clear`, `heartbeat`, `shutdown`

### REST Endpoints
- `GET /api/notifications` — Fetch all notifications (used on connect and periodic refresh)
- `DELETE /api/notifications?id=xxx` — Delete a single notification
- `GET /api/e2e` — Server e2e state `{enabled, alg, kid}` (shown in the status popup)

## Commands

```bash
# Install dependencies (after cloning)
make tui-deps
# Equivalent: cd src/notifyhub/tui && bun install

# Run the TUI (backend must be running on :9080)
make tui
# Equivalent: cd src/notifyhub/tui && bun src/index.tsx
# make tui first prints "e2e key: <source> (kid …)" when a key is configured
```

## Configuration

The TUI connects to `localhost:9080` by default. To change the backend address, update the default constants in `src/notifyhub/tui/src/utils/api.ts`.

E2E decryption key (see [e2e-encryption.md](e2e-encryption.md)) — resolved in
order: `NOTIFYHUB_E2E_KEY` env → `e2e.key` in `config.jsonl`/`config.json` →
key file:

| Env var | Default | Description |
|---------|---------|-------------|
| `NOTIFYHUB_E2E_KEY` | _(unset)_ | AES-256-GCM key (base64/hex); overrides the config/key file |
| `NOTIFYHUB_CONFIG` | `~/.config/notifyhub/config.jsonl` | Config file to read `e2e.key` from (JSON5) |
| `NOTIFYHUB_E2E_KEY_FILE` | `~/.config/notifyhub/e2e.key` | Key file used when the other sources are unset |
