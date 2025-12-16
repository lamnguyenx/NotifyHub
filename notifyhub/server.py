from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from pydantic import BaseModel
from sse_starlette.sse import EventSourceResponse
from contextlib import asynccontextmanager
import uvicorn
from uvicorn import Config, Server
import argparse
import asyncio
from typing import List
import logging
import json
from datetime import datetime

from .models import NotificationStore

class SSEManager:
    def __init__(self):
        self.active_connections: List[asyncio.Queue] = []

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
    message: str

@asynccontextmanager
async def lifespan(app: FastAPI):
    yield
    # Shutdown: notify all SSE connections to close
    for queue in sse_manager.active_connections:
        try:
            queue.put_nowait({"event": "shutdown", "data": json.dumps({"message": "Server shutting down"})})
        except:
            pass
    sse_manager.active_connections.clear()

app = FastAPI(lifespan=lifespan)
sse_manager = SSEManager()
store = NotificationStore(sse_manager=sse_manager)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Static files and templates setup
app.mount("/static", StaticFiles(directory="web/static"), name="static")
templates = Jinja2Templates(directory="web/templates")

@app.post("/api/notify")
async def notify(request: NotifyRequest):
    notification_id = store.add(request.message)
    return {"success": True, "id": notification_id}

@app.get("/api/notifications")
async def get_notifications():
    return store.notifications

@app.get("/events")
async def events():
    """SSE endpoint for real-time notifications"""
    queue = await sse_manager.connect()

    async def event_generator():
        try:
            # Send current notifications on connect
            current_notifications = [
                {
                    "id": n.id,
                    "message": n.message,
                    "timestamp": n.timestamp.isoformat()
                }
                for n in store.notifications
            ]
            yield {"event": "init", "data": json.dumps(current_notifications)}

            heartbeat_count = 0
            while True:
                # Send heartbeat every 30 seconds
                if heartbeat_count % 30 == 0:
                    yield {"event": "heartbeat", "data": json.dumps({"timestamp": datetime.now().isoformat()})}

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
    return templates.TemplateResponse("index.html", {"request": {}})

def main():
    parser = argparse.ArgumentParser(description='Start NotifyHub server')
    parser.add_argument('--port', type=int, default=9080, help='Port to run server on')
    args = parser.parse_args()

    config = Config(app, host="0.0.0.0", port=args.port, timeout_graceful_shutdown=1)
    server = Server(config)
    server.run()

if __name__ == "__main__":
    main()