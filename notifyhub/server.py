from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from pydantic import BaseModel
import uvicorn
import argparse
from datetime import datetime

from .models import NotificationStore

class NotifyRequest(BaseModel):
    message: str

app = FastAPI()
store = NotificationStore()

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

@app.get("/", response_class=HTMLResponse)
async def root():
    return templates.TemplateResponse("index.html", {"request": {}})

def main():
    parser = argparse.ArgumentParser(description='Start NotifyHub server')
    parser.add_argument('--port', type=int, default=9080, help='Port to run server on')
    args = parser.parse_args()
    
    uvicorn.run(app, host="0.0.0.0", port=args.port)

if __name__ == "__main__":
    main()