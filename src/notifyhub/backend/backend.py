from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from sse_starlette.sse import EventSourceResponse
from contextlib import asynccontextmanager
from uvicorn import Config, Server, run as uvicorn_run
import asyncio
import typing as tp
import logging
import json
import os
import textwrap
import traceback
from datetime import datetime

from confstack import confstackify

from .models import NotificationStore, Notification, serialize_notification
from ..config import NotifyHubConfig
from ..crypto import (
    CryptoError,
    decrypt_payload,
    encrypt_payload,
    is_envelope,
    key_id as crypto_key_id,
    load_key as load_e2e_key,
)
from ..macos_notify import send_macos_notification
from ..telegram import get_telegram_token, async_send_telegram_message
from ..bark import (
    get_bark_aes_key,
    async_send_bark_notification,
    _get_dicebear_icon_url,
)


class SSEManager:
    def __init__(self, heartbeat_interval=30):
        self.active_connections: tp.List[asyncio.Queue] = []
        self.heartbeat_interval = heartbeat_interval

    async def connect(self) -> asyncio.Queue:
        queue = asyncio.Queue()
        self.active_connections.append(queue)
        return queue

    def disconnect(self, queue: asyncio.Queue):
        if queue in self.active_connections:
            self.active_connections.remove(queue)

    async def broadcast(self, event_data: dict):
        """Broadcast event to all connected clients"""
        disconnected = []
        for queue in self.active_connections:
            try:
                await queue.put(event_data)
            except Exception as e:
                logging.error(f"Failed to broadcast to client: {e}")
                disconnected.append(queue)

        # Clean up disconnected clients
        for queue in disconnected:
            self.disconnect(queue)


class NotifyRequest(BaseModel):
    id: tp.Optional[str] = None
    data: dict


@asynccontextmanager
async def lifespan(app: FastAPI):
    yield
    # Shutdown: notify all SSE connections to close
    for queue in sse_manager.active_connections:
        try:
            queue.put_nowait(
                {
                    "event": "shutdown",
                    "data": json.dumps({"message": "Server shutting down"}),
                }
            )
        except:
            pass
    sse_manager.active_connections.clear()


app = FastAPI(lifespan=lifespan)
sse_manager = SSEManager()
store = NotificationStore(sse_manager=sse_manager)
_e2e_enabled: bool = False
_e2e_key: tp.Optional[bytes] = None
_telegram_bot_token: tp.Optional[str] = None
_telegram_chat_id: str = ""
_telegram_group_chat_id: str = ""
_telegram_notify_tags: tp.List[str] = []
_macos_notifications_enabled: bool = True
_bark_device_key: str = ""
_bark_aes_key: tp.Optional[str] = None
_bark_notify_tags: tp.List[str] = []

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Static files and templates setup
frontend_dir = os.path.join(os.path.dirname(__file__), "../frontend")
app.mount(
    "/static",
    StaticFiles(directory=os.path.join(frontend_dir, "static")),
    name="static",
)
app.mount(
    "/icons",
    StaticFiles(directory=os.path.join(frontend_dir, "static/icons")),
    name="icons",
)
app.mount(
    "/audio",
    StaticFiles(directory=os.path.join(frontend_dir, "static/audio")),
    name="audio",
)


def load_and_transform_template():
    """Load index.html and transform it for production use."""
    template_path = os.path.join(frontend_dir, "index.html")
    try:
        with open(template_path, "r", encoding="utf-8") as f:
            html = f.read()

        # Replace dev script with production script
        html = html.replace("/src/main.tsx", "/static/app.js")

        # Ensure main.css is linked (add after Bootstrap if not present)
        if "/static/main.css" not in html:
            bootstrap_link = 'bootstrap.min.css" rel="stylesheet">'
            css_link = (
                f'{bootstrap_link}\n    <link href="/static/main.css" rel="stylesheet">'
            )
            html = html.replace(bootstrap_link, css_link)

        return html
    except FileNotFoundError:
        # Fallback if index.html doesn't exist
        return textwrap.dedent(
            """
            <!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <title>NotifyHub - Error</title>
            </head>
            <body>
                <h1>Error: Frontend template not found</h1>
                <p>Please ensure the frontend is properly set up.</p>
            </body>
            </html>
            """
        ).strip()


@app.post("/api/notify")
async def notify(request: NotifyRequest):
    try:
        raw: dict = request.data

        # Ingest: accept either an e2e envelope (decrypt with the shared key)
        # or a legacy plaintext payload. Only plaintext is used from here on.
        if is_envelope(raw):
            if not _e2e_key:
                raise CryptoError(
                    "received an encrypted envelope but no e2e key is configured"
                )
            data = decrypt_payload(raw, _e2e_key)
        else:
            data = raw

        if not isinstance(data, dict) or not isinstance(data.get("message"), str):
            raise ValueError("data.message is required and must be a string")

        message_text = data["message"]
        pwd = data.get("pwd")

        tag_match = not _telegram_notify_tags or any(t in message_text for t in _telegram_notify_tags)

        telegram_text = f"{pwd}\n{message_text}" if pwd else message_text

        if tag_match and _telegram_bot_token and _telegram_chat_id:
            asyncio.create_task(
                async_send_telegram_message(
                    token=_telegram_bot_token,
                    chat_id=_telegram_chat_id,
                    text=telegram_text,
                )
            )

        if tag_match and _telegram_bot_token and _telegram_group_chat_id:
            asyncio.create_task(
                async_send_telegram_message(
                    token=_telegram_bot_token,
                    chat_id=_telegram_group_chat_id,
                    text=telegram_text,
                )
            )

        if _macos_notifications_enabled:
            send_macos_notification(
                text=message_text,
                pwd=pwd,
            )

        bark_tag_match = not _bark_notify_tags or any(t in message_text for t in _bark_notify_tags)
        logging.info(
            "Bark check: tag_match=%s, device_key=%s, aes_key=%s, tags=%s",
            bark_tag_match, bool(_bark_device_key), bool(_bark_aes_key), _bark_notify_tags,
        )

        if bark_tag_match and _bark_device_key and _bark_aes_key:
            logging.info("Sending Bark notification for message: %s", message_text[:80])
            basename = os.path.basename(pwd or "")
            seed = basename[:1].upper() if basename else ""
            icon_url = _get_dicebear_icon_url(seed) if seed else ""
            asyncio.create_task(
                async_send_bark_notification(
                    device_key=_bark_device_key,
                    title=basename or "NotifyHub",
                    body=message_text,
                    icon_url=icon_url,
                    aes_key=_bark_aes_key,
                )
            )
        else:
            logging.info(
                "Skipping Bark: tag_match=%s, device_key=%s, aes_key=%s",
                bark_tag_match, bool(_bark_device_key), bool(_bark_aes_key),
            )

        # Store/serve: encrypt the payload into an e2e envelope when a key is
        # configured, so nothing plaintext is kept in memory-backed storage or
        # broadcast over SSE/REST. Legacy plaintext mode is kept otherwise.
        stored = encrypt_payload(data, _e2e_key) if _e2e_key else data
        record = Notification(id=request.id, data=stored)
        notification_id = store.add(record, request.id)

        return {"success": True, "id": notification_id}
    except CryptoError as e:
        return {"error": [f"E2E crypto error: {e}"]}
    except Exception as e:
        return {"error": traceback.format_exc().split("\n")}


@app.get("/api/e2e")
async def e2e_status():
    """Report server-side e2e encryption state (no secrets)."""
    if _e2e_key:
        return {"enabled": True, "alg": "A256GCM", "kid": crypto_key_id(_e2e_key)}
    return {"enabled": False, "alg": None, "kid": None}


@app.get("/api/notifications")
async def get_notifications(
    limit: tp.Optional[int] = None,
    offset: int = 0,
    before: tp.Optional[str] = None,
):
    """Return notifications (newest-first), optionally paginated.

    - limit: max number of items to return (None = all)
    - offset: skip the first N items (ignored when `before` is given)
    - before: return items strictly older than the given notification id.
      This is a stable cursor: new notifications are prepended, so offset
      would shift, but `before` stays anchored.
    """
    notifications = store.notifications

    if before is not None:
        idx = next((i for i, n in enumerate(notifications) if n.id == before), None)
        # Cursor gone (e.g. deleted): return nothing rather than restarting.
        start = idx + 1 if idx is not None else len(notifications)
    else:
        start = max(0, offset)

    end = None if limit is None else start + max(0, limit)
    return [serialize_notification(n) for n in notifications[start:end]]


@app.get("/api/notifications/count")
async def get_notifications_count():
    return {"count": len(store.notifications)}


@app.delete("/api/notifications")
async def delete_notifications(id: tp.Optional[str] = None):
    """Delete notifications - all if no id provided, specific if id given"""
    if id:
        # Delete specific notification
        if store.delete_by_id(id):
            # Broadcast delete event with ID
            await sse_manager.broadcast(
                {
                    "event": "delete",
                    "data": json.dumps(
                        {"id": id, "message": f"Notification {id} deleted"}
                    ),
                }
            )
            return {"success": True, "message": f"Notification {id} deleted"}
        else:
            # Notification not found
            from fastapi import HTTPException

            raise HTTPException(status_code=404, detail="Notification not found")
    else:
        # Clear all notifications (existing behavior)
        store.clear_all()
        await sse_manager.broadcast(
            {
                "event": "clear",
                "data": json.dumps({"message": "All notifications cleared"}),
            }
        )
        return {"success": True, "message": "All notifications cleared"}


@app.get("/events")
async def events(limit: tp.Optional[int] = None):
    """SSE endpoint for real-time notifications.

    `limit` caps how many notifications the initial `init` event carries.
    Clients can then page older history via GET /api/notifications. Omitting
    `limit` preserves the original behavior of sending the whole store.
    """
    queue = await sse_manager.connect()

    async def event_generator():
        try:
            # Send current notifications on connect
            initial = store.notifications if limit is None else store.notifications[: max(0, limit)]
            current_notifications = [serialize_notification(n) for n in initial]
            yield {"event": "init", "data": json.dumps(current_notifications)}

            heartbeat_count = 0
            while True:
                # Send heartbeat every heartbeat_interval seconds
                if heartbeat_count % sse_manager.heartbeat_interval == 0:
                    yield {
                        "event": "heartbeat",
                        "data": json.dumps({"timestamp": datetime.now().isoformat()}),
                    }

                # Wait for new events or timeout for heartbeat
                try:
                    event_data = await asyncio.wait_for(queue.get(), timeout=1.0)
                    if event_data.get("event") == "shutdown":
                        break
                    yield event_data
                except asyncio.TimeoutError:
                    heartbeat_count += 1
                    continue

        except asyncio.CancelledError:
            sse_manager.disconnect(queue)
            raise

    return EventSourceResponse(event_generator())


@app.get("/", response_class=HTMLResponse)
async def root():
    html_content = load_and_transform_template()
    return HTMLResponse(html_content)


def _load_runtime(config: NotifyHubConfig) -> None:
    """Apply config to module globals (re-applied on reload-worker import)."""
    global sse_manager, store, _e2e_enabled, _e2e_key, _telegram_bot_token, _telegram_chat_id, _telegram_group_chat_id, _telegram_notify_tags, _macos_notifications_enabled, _bark_device_key, _bark_aes_key, _bark_notify_tags
    sse_manager = SSEManager(heartbeat_interval=config.backend.sse_heartbeat_interval)
    store = NotificationStore(
        sse_manager=sse_manager, max_count=config.backend.notifications_max_count
    )

    _e2e_enabled = bool(config.e2e.enabled)
    _e2e_key = None
    if _e2e_enabled:
        try:
            _e2e_key = load_e2e_key(config.e2e.key)
        except CryptoError as exc:
            logging.error("E2E enabled but key is invalid: %s", exc)
        if _e2e_key:
            logging.info(
                "E2E encryption enabled (kid=%s): payloads are decrypted for push, "
                "then stored/served as AES-256-GCM envelopes",
                crypto_key_id(_e2e_key),
            )
        else:
            _e2e_enabled = False
            logging.warning(
                "E2E enabled but no key found (e2e.key / NOTIFYHUB_E2E_KEY env / "
                "keychain 'notifyhub_e2e_key') — falling back to plaintext storage"
            )

    _telegram_chat_id = config.backend.telegram_chat_id
    _telegram_group_chat_id = config.backend.telegram_group_chat_id
    _telegram_notify_tags = config.backend.telegram_notify_tags
    _macos_notifications_enabled = config.backend.macos_notifications_enabled
    if _macos_notifications_enabled:
        logging.info("macOS notifications enabled")
    if _telegram_chat_id:
        _telegram_bot_token = get_telegram_token()
        if _telegram_bot_token:
            logging.info("Telegram notifications enabled")
        else:
            logging.warning(
                "Telegram chat_id configured but bot token not found in keychain. "
                "Run: security add-generic-password -a notifyhub -s telegram-bot-token -w YOUR_TOKEN"
            )
    if _telegram_group_chat_id:
        if not _telegram_bot_token:
            _telegram_bot_token = get_telegram_token()
        if _telegram_bot_token:
            logging.info("Telegram group notifications enabled")
        else:
            logging.warning(
                "Telegram group_chat_id configured but bot token not found in keychain."
            )

    _bark_device_key = config.backend.bark_device_key
    _bark_notify_tags = config.backend.bark_notify_tags
    if _bark_device_key:
        _bark_aes_key = get_bark_aes_key()
        if _bark_aes_key:
            logging.info("Bark notifications enabled")
        else:
            logging.warning(
                "Bark device_key configured but AES key not found in keychain. "
                "Run: security add-generic-password -a $USER -s bark_noti_aes_key -w YOUR_AES_KEY"
            )


_load_runtime(confstackify(NotifyHubConfig, "notifyhub"))


def main():
    config: NotifyHubConfig = confstackify(
        NotifyHubConfig, "notifyhub", parse_cli_args=True
    )
    _load_runtime(config)

    if config.backend.dev_reload:
        # Server.run() ignores reload in modern uvicorn; uvicorn.run() owns the
        # ChangeReload supervisor and spawns workers that re-import the app.
        uvicorn_run(
            "notifyhub.backend.backend:app",
            host=config.backend.host,
            port=config.backend.port,
            timeout_graceful_shutdown=1,
            reload=True,
        )
    else:
        server = Server(
            Config(
                app,
                host=config.backend.host,
                port=config.backend.port,
                timeout_graceful_shutdown=1,
            )
        )
        server.run()


if __name__ == "__main__":
    main()
