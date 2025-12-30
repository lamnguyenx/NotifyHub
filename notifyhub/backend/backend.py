from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from pydantic import BaseModel
from sse_starlette.sse import EventSourceResponse
from contextlib import asynccontextmanager
from uvicorn import Config, Server
import argparse
import asyncio
from typing import List, Optional
import logging
import json
import os
from datetime import datetime

from .models import NotificationStore, NotificationData

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
    id: Optional[str] = None
    data: dict

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
frontend_dir = os.path.join(os.path.dirname(__file__), "../frontend")
app.mount("/static", StaticFiles(directory=os.path.join(frontend_dir, "public")), name="static")
app.mount("/icons", StaticFiles(directory=os.path.join(frontend_dir, "public/icons")), name="icons")
app.mount("/audio", StaticFiles(directory=os.path.join(frontend_dir, "public/audio")), name="audio")
templates = Jinja2Templates(directory=os.path.join(frontend_dir, "templates"))

@app.post("/api/notify")
async def notify(request: NotifyRequest):
    data = NotificationData.model_validate(request.data)
    custom_id = request.id
    notification_id = store.add(data, custom_id)
    return {"success": True, "id": notification_id}

@app.get("/api/notifications")
async def get_notifications():
    return store.notifications

@app.delete("/api/notifications")
async def delete_notifications(id: Optional[str] = None):
    """Delete notifications - all if no id provided, specific if id given"""
    if id:
        # Delete specific notification
        if store.delete_by_id(id):
            # Broadcast delete event with ID
            await sse_manager.broadcast({
                "event": "delete",
                "data": json.dumps({"id": id, "message": f"Notification {id} deleted"})
            })
            return {"success": True, "message": f"Notification {id} deleted"}
        else:
            # Notification not found
            from fastapi import HTTPException
            raise HTTPException(status_code=404, detail="Notification not found")
    else:
        # Clear all notifications (existing behavior)
        store.clear_all()
        await sse_manager.broadcast({
            "event": "clear",
            "data": json.dumps({"message": "All notifications cleared"})
        })
        return {"success": True, "message": "All notifications cleared"}

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
                    "data": n.data,
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
async def root(request: Request):
    return templates.TemplateResponse(request, "index.fastapi.html")

def main():
    parser = argparse.ArgumentParser(description='Start NotifyHub server')
    parser.add_argument('--port', type=int, default=9080, help='Port to run server on')
    args = parser.parse_args()

    config = Config(app, host="0.0.0.0", port=args.port, timeout_graceful_shutdown=1)
    server = Server(config)
    server.run()

if __name__ == "__main__":
    main()