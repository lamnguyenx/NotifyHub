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
from datetime import datetime, timezone

from confstack import confstackify

from .models import (
    AgentStatusStore,
    DEFAULT_STATUS_STALE_SECONDS,
    NotificationStore,
    Notification,
    STATUS_AGENTS,
    STATUS_STATES,
    serialize_notification,
)
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
status_store = AgentStatusStore(sse_manager=sse_manager)
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

        # Ensure main.css is linked. The dev server injects it through the
        # module graph; production serves the built file directly. Inject
        # before </head> so the template does not need a Bootstrap (or any
        # other) placeholder link.
        if "/static/main.css" not in html:
            css_link = '<link href="/static/main.css" rel="stylesheet">'
            if "</head>" in html:
                html = html.replace("</head>", f"    {css_link}\n  </head>", 1)
            else:
                html = f"{css_link}\n{html}"

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


TASK_EXCERPT_MAX_CHARS = 160


def task_excerpt(body: dict) -> tp.Optional[str]:
    """One-line task excerpt for the running turn, or None.

    claude/codex curl hooks pipe their raw hook payload, whose UserPromptSubmit
    carries `prompt`; the OpenCode plugin posts `task` explicitly. Whitespace
    is collapsed (the TUI row is a single line) and the tail is dropped."""
    raw = body.get("task")
    if not isinstance(raw, str):
        raw = body.get("prompt")
    if not isinstance(raw, str):
        return None
    collapsed = " ".join(raw.split())
    if not collapsed:
        return None
    if len(collapsed) > TASK_EXCERPT_MAX_CHARS:
        collapsed = collapsed[: TASK_EXCERPT_MAX_CHARS - 1].rstrip() + "…"
    return collapsed


@app.post("/api/status/{agent}/{state}")
async def report_status(agent: str, state: str, request: Request):
    """Ingest one agent lifecycle report (herdr-style thin reporters).

    The body is whatever the reporter has: claude/codex hooks pipe their raw
    hook payload (session_id/cwd live inside it), the OpenCode plugin posts
    explicit fields, and an e2e envelope is accepted too. The server owns the
    parsing, so reporters stay one-line `curl --data-binary @-` commands.
    """
    try:
        if agent not in STATUS_AGENTS:
            raise ValueError(
                f"unknown agent {agent!r}; expected one of {sorted(STATUS_AGENTS)}"
            )
        if state not in STATUS_STATES:
            raise ValueError(
                f"unknown state {state!r}; expected one of {sorted(STATUS_STATES)}"
            )

        raw = await request.body()
        try:
            body = json.loads(raw) if raw.strip() else {}
        except (ValueError, UnicodeDecodeError):
            body = {}
        if not isinstance(body, dict):
            body = {}
        if is_envelope(body):
            if not _e2e_key:
                raise CryptoError(
                    "received an encrypted envelope but no e2e key is configured"
                )
            body = decrypt_payload(body, _e2e_key)

        session_id = str(body.get("session_id") or body.get("sessionId") or "").strip()
        if not session_id:
            raise ValueError(
                "session_id is required (claude/codex hook payloads carry it)"
            )
        pwd = body.get("pwd") if isinstance(body.get("pwd"), str) else None
        cwd = body.get("cwd") if isinstance(body.get("cwd"), str) else None
        body_host = body.get("host")
        header_host = request.headers.get("x-notifyhub-host", "").strip()
        host: tp.Optional[str] = None
        if isinstance(body_host, str) and body_host.strip():
            host = body_host.strip()
        elif header_host:
            # The raw hook one-liners pipe the upstream JSON untouched, so the
            # machine name rides in a header instead of rewriting the body.
            host = header_host
        elif request.client:
            host = request.client.host

        changed = status_store.update(
            agent, session_id, state, pwd=pwd or cwd, host=host, task=task_excerpt(body)
        )
        return {"success": True, "changed": changed}
    except CryptoError as e:
        return {"error": [f"E2E crypto error: {e}"]}
    except Exception:
        return {"error": traceback.format_exc().split("\n")}


@app.get("/api/status")
async def get_status():
    """Live agent session states.

    Ephemeral server-owned runtime facts (RAM only, never persisted). While a
    `running` entry that stops refreshing past the stale window is served as
    `stale`, the stored state is untouched, so a late refresh revives it.
    Entries are wrapped in e2e envelopes per-item (like notifications) when
    a key is configured.
    """
    return {
        "agents": status_store.list_payloads(),
        "server_time": datetime.now(timezone.utc).isoformat(),
    }


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
    global sse_manager, store, status_store, _e2e_enabled, _e2e_key, _telegram_bot_token, _telegram_chat_id, _telegram_group_chat_id, _telegram_notify_tags, _macos_notifications_enabled, _bark_device_key, _bark_aes_key, _bark_notify_tags
    sse_manager = SSEManager(heartbeat_interval=config.backend.sse_heartbeat_interval)
    store = NotificationStore(
        sse_manager=sse_manager, max_count=config.backend.notifications_max_count
    )
    status_store = AgentStatusStore(
        sse_manager=sse_manager,
        # getattr: the deployed image may predate this config field (mixed
        # hotfixes ship backend.py without the matching config.py).
        stale_after=getattr(
            config.backend,
            "agent_status_stale_seconds",
            DEFAULT_STATUS_STALE_SECONDS,
        ),
        # `_e2e_key` is resolved at call time so the transform follows key
        # reloads without rebuilding the store.
        entry_transform=(
            (lambda payload: encrypt_payload(payload, _e2e_key)) if config.e2e.enabled else None
        ),
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
