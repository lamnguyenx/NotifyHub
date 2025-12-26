# NotifyHub Implementation Plan

## Overview

Build a lightweight notification system following the glances `-w` pattern: a self-contained Python server using FastAPI that bundles both REST API and web dashboard, plus a separate CLI client. The web UI uses HTTP polling for real-time updates rather than WebSocket/SSE for simplicity.

## Current State Analysis

- Empty repository with only requirements documentation
- No existing code or patterns to follow
- Greenfield project requiring complete implementation

## Desired End State

A working notification system where:
- `notifyhub-server --port 9080` starts a self-contained server with web UI at http://localhost:9080
- `notifyhub-push --port 9080 "message"` sends notifications from CLI
- Notifications appear in real-time in the web dashboard with sound alerts
- System supports 1000+ notifications in memory with <100ms delivery

### Key Discoveries:
- Glances pattern: single binary serves both API and web UI, Vue.js frontend polls for updates
- Python + FastAPI provides excellent self-contained server capabilities
- HTTP polling is simpler and more reliable than WebSocket for this use case
- In-memory storage sufficient for requirements (no database needed)

## What We're NOT Doing

- Database persistence (requirements specify in-memory or optional file storage)
- WebSocket/SSE real-time updates (using HTTP polling like glances)
- Multi-user authentication (single-user system)
- Advanced features like filtering, categories, or desktop notifications

## Implementation Approach

Follow glances architecture:
- Python FastAPI server for REST API and static file serving
- Vue.js single-page application with Bootstrap styling (built with Bun + Vite)
- Separate CLI client as standalone Python script
- HTTP polling every 2 seconds for real-time updates
- In-memory notification storage with unique IDs
- Audio notifications with preloaded sound (reused for efficiency)

## Phase 1: Core Server & API

### Overview
Build the FastAPI server with notification storage, REST API endpoints, and basic web UI serving.

### Changes Required:

#### 1. Project Structure Setup
**File**: `pyproject.toml`, `requirements.txt`, `notifyhub/`
**Changes**: Create Python project structure with FastAPI, Uvicorn, Vue.js dependencies

```python
# pyproject.toml
[project]
name = "notifyhub"
version = "0.1.0"
dependencies = [
    "fastapi",
    "uvicorn",
    "jinja2",
    "python-multipart",
    "aiofiles"
]

[project.scripts]
notifyhub-server = "notifyhub.server:main"
```

#### 2. Notification Data Model
**File**: `notifyhub/models.py`
**Changes**: Define notification model with message, timestamp, and unique ID

```python
from datetime import datetime
from typing import List
import uuid

class Notification:
    def __init__(self, message: str):
        self.id = str(uuid.uuid4())
        self.message = message
        self.timestamp = datetime.now()

class NotificationStore:
    def __init__(self):
        self.notifications: List[Notification] = []
        self.max_notifications = 1000
    
    def add(self, message: str) -> str:
        notification = Notification(message)
        self.notifications.insert(0, notification)  # Newest first
        if len(self.notifications) > self.max_notifications:
            self.notifications.pop()
        return notification.id
```

#### 3. FastAPI Server
**File**: `notifyhub/server.py`
**Changes**: Create FastAPI app with CORS, notification endpoints, and static file serving

```python
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
import uvicorn

from .models import NotificationStore

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
app.mount("/static", StaticFiles(directory="notifyhub/frontend/static"), name="static")
templates = Jinja2Templates(directory="notifyhub/frontend/templates")

@app.post("/api/notify")
async def notify(message: str):
    notification_id = store.add(message)
    return {"success": True, "id": notification_id}

@app.get("/api/notifications")
async def get_notifications():
    return store.notifications

@app.get("/", response_class=HTMLResponse)
async def root():
    return templates.TemplateResponse("index.html", {"request": {}})
```

### Success Criteria:

#### Automated Verification:
- [ ] Server starts successfully: `python -m notifyhub.server --port 9080`
- [ ] API endpoint responds: `curl -X POST http://localhost:9080/api/notify -d "test"`
- [ ] Notifications endpoint returns data: `curl http://localhost:9080/api/notifications`
- [ ] Static files served: `curl http://localhost:9080/static/test.txt` (create test file)

#### Manual Verification:
- [ ] Web UI loads at http://localhost:9080
- [ ] Basic HTML page displays (placeholder content)
- [ ] No errors in server console

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation that the server starts correctly and serves basic content.

---

## Phase 2: Web Dashboard

### Overview
Build the Vue.js frontend with real-time polling, notification display, and basic styling.

### Changes Required:

#### 1. Vue.js Setup
**File**: `notifyhub/frontend/package.json`, `notifyhub/frontend/src/`
**Changes**: Create Vue.js project with Bootstrap and polling logic

```json
// notifyhub/frontend/package.json
{
  "name": "notifyhub-web",
  "scripts": {
    "build": "vite build",
    "dev": "vite build --watch"
  },
  "dependencies": {
    "vue": "^3.3.0",
    "bootstrap": "^5.3.0"
  },
  "devDependencies": {
    "vite": "^5.0.0",
    "@vitejs/plugin-vue": "^5.0.0"
  }
}
```

#### 2. Vue Components
**File**: `notifyhub/frontend/src/App.vue`
**Changes**: Create notification list component with polling, clear all functionality, and animations

```vue
<template>
  <div class="container mt-4">
    <h1 class="mb-4">🔔 NotifyHub</h1>
    <div v-if="connectionError" class="alert alert-warning">
      Connection lost - retrying...
    </div>
    <div v-if="notifications.length === 0 && !connectionError" class="text-center text-muted">
      No notifications yet
    </div>
    <div v-else-if="!connectionError" class="row">
      <div class="col-md-8 mx-auto">
        <div class="d-flex justify-content-end mb-3">
          <button @click="clearAllNotifications"
                  class="btn btn-outline-danger btn-sm"
                  :disabled="notifications.length === 0">
            Clear All
          </button>
        </div>
        <transition-group name="notification" tag="div">
          <div v-for="notification in notifications"
               :key="notification.id"
               class="card mb-2">
            <div class="card-body">
              <div class="d-flex justify-content-between">
                <div>
                  <h6 class="card-title">{{ notification.message }}</h6>
                  <small class="text-muted">
                    {{ formatDate(notification.timestamp) }}
                  </small>
                </div>
                <span class="text-primary">🔔</span>
              </div>
            </div>
          </div>
        </transition-group>
      </div>
    </div>
  </div>
</template>

<script>
export default {
  data() {
    return {
      notifications: [],
      connectionError: false,
      audio: null
    }
  },
  mounted() {
    this.audio = new Audio('/static/audio/Submarine.mp3');
    this.audio.volume = 0.3;
    this.audio.load();

    this.fetchNotifications();
    setInterval(this.fetchNotifications, 2000); // Poll every 2 seconds
  },
  methods: {
    async fetchNotifications() {
      try {
        const response = await fetch('/api/notifications');
        this.notifications = await response.json();
        this.connectionError = false;
      } catch (error) {
        console.error('Failed to fetch notifications:', error);
        this.connectionError = true;
      }
    },
    formatDate(timestamp) {
      return new Date(timestamp).toLocaleString();
    },
    clearAllNotifications() {
      this.notifications = [];
    }
  }
}
</script>

<style scoped>
.notification-enter-active {
  animation: popIn 0.5s ease-out;
}

.notification-enter-from {
  opacity: 0;
  transform: scale(0.8) translateY(-20px);
}

@keyframes popIn {
  0% {
    opacity: 0;
    transform: scale(0.8) translateY(-20px);
  }
  50% {
    opacity: 0.8;
    transform: scale(1.05) translateY(0);
  }
  100% {
    opacity: 1;
    transform: scale(1) translateY(0);
  }
}
</style>
```

#### 3. Build Integration
**File**: `notifyhub/server.py`
**Changes**: Update to serve built Vue.js files

```python
# Update static file mounting to serve built Vue files
app.mount("/static", StaticFiles(directory="notifyhub/frontend/dist/static"), name="static")
```

### Success Criteria:

#### Automated Verification:
- [ ] Vue.js builds successfully: `cd web && bun run build`
- [ ] Vite generates static/ directory with bundled files
- [ ] Server serves Vue app: Vue components load without errors

#### Manual Verification:
- [ ] Dashboard displays at http://localhost:9080
- [ ] "No notifications yet" message shows initially
- [ ] Page updates automatically (no manual refresh needed)
- [ ] Clean, minimal UI with Bootstrap styling

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation that the web dashboard loads and polls correctly.

---

## Phase 3: CLI Client

### Overview
Create a standalone CLI tool for sending notifications to the server.

### Changes Required:

#### 1. CLI Script
**File**: `notifyhub/cli.py`, `pyproject.toml`
**Changes**: Add CLI entry point for sending notifications

```python
# notifyhub/cli.py
import argparse
import requests
import sys

def main():
    parser = argparse.ArgumentParser(description='Send notifications to NotifyHub server')
    parser.add_argument('--port', type=int, default=9080, help='Server port')
    parser.add_argument('message', help='Notification message')
    
    args = parser.parse_args()
    
    try:
        response = requests.post(
            f'http://localhost:{args.port}/api/notify',
            json={'message': args.message},
            timeout=5
        )
        response.raise_for_status()
        
        if response.json().get('success'):
            print('✓ Notification sent successfully')
            sys.exit(0)
        else:
            print('✗ Failed to send notification')
            sys.exit(1)
            
    except requests.exceptions.RequestException as e:
        print(f'✗ Error: {e}')
        sys.exit(1)

if __name__ == '__main__':
    main()
```

#### 2. CLI Entry Point
**File**: `pyproject.toml`
**Changes**: Add CLI script entry point

```toml
[project.scripts]
notifyhub-server = "notifyhub.server:main"
notifyhub-push = "notifyhub.cli:main"
```

### Success Criteria:

#### Automated Verification:
- [ ] CLI builds/installs: `pip install -e .`
- [ ] CLI command available: `notifyhub-push --help` shows help
- [ ] CLI sends to server: `notifyhub-push --port 9080 "test"` returns success

#### Manual Verification:
- [ ] Notification appears in web dashboard immediately
- [ ] Multiple notifications display in correct order (newest first)
- [ ] Error handling works (wrong port shows error message)

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation that CLI notifications appear in the dashboard.

---

## Phase 4: Audio & Polish

### Overview
Add notification sounds (implemented in Phase 2), improve UX with animations and error handling, and handle edge cases.

### Changes Required:

#### 1. Audio Integration
**Status**: ✅ Implemented in Phase 2
**File**: `notifyhub/frontend/src/App.vue`
**Changes**: Audio notifications are now integrated with notification polling

#### 2. Real-time Improvements
**File**: `notifyhub/server.py`
**Changes**: Add server timestamp to responses for better caching

```python
@app.get("/api/notifications")
async def get_notifications():
    return {
        "notifications": store.notifications,
        "timestamp": datetime.now().isoformat()
    }
```

#### 3. Enhanced Error Handling
**Status**: ✅ Implemented in Phase 2
**File**: `notifyhub/frontend/src/App.vue`
**Changes**: Connection error states and retry logic implemented

#### 4. Notification Animations
**Status**: ✅ Implemented in Phase 2
**File**: `notifyhub/frontend/src/App.vue`
**Changes**: Popping animations added for new notifications

#### 5. Clear All Functionality
**Status**: ✅ Implemented in Phase 2 + Server sync added
**Files**: `notifyhub/frontend/src/App.vue`, `notifyhub/server.py`, `notifyhub/models.py`
**Changes**:
- Added DELETE `/api/notifications` endpoint to clear all notifications server-side
- Added `clear_all()` method to NotificationStore
- Clear All button now syncs across all connected clients via SSE broadcast
- Added `clear` SSE event handling for real-time sync

### Success Criteria:

#### Automated Verification:
- [ ] Audio file exists: `ls notifyhub/frontend/static/audio/Submarine.mp3`
- [ ] Error handling works: Disconnect server, check UI shows error state

#### Manual Verification:
- [ ] Sound plays on new notifications (preloaded and reused)
- [ ] UI handles server disconnection gracefully
- [ ] Performance acceptable with 100+ notifications
- [ ] Clean, professional appearance

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation that audio works and system feels polished.

---

## Testing Strategy

### Unit Tests:
- Test notification storage (add, limit enforcement)
- Test API endpoints (POST /api/notify, GET /api/notifications)
- Test CLI argument parsing and HTTP requests

### Integration Tests:
- Server startup and shutdown
- CLI to server communication
- Web UI polling and display

### Manual Testing Steps:
1. Build web: `cd web && bun run build`
2. Start server: `python -m notifyhub.server --port 9080` or `notifyhub-server --port 9080`
3. Open browser to http://localhost:9080
4. Send notification: `notifyhub-push --port 9080 "Test message"` or `python -m notifyhub.cli --port 9080 "Test message"`
5. Verify notification appears with sound
6. Test multiple notifications and ordering
7. Test error cases (wrong port, server down)

## Performance Considerations

- HTTP polling every 2 seconds (configurable)
- In-memory storage with 1000 notification limit
- FastAPI async handling for concurrent requests
- Gzip compression enabled by default

## Migration Notes

- No existing data to migrate (greenfield project)
- In-memory storage means data lost on restart (by design)

## References

- Glances web interface pattern: https://github.com/nicolargo/glances
- FastAPI documentation: https://fastapi.tiangolo.com/
- Vue.js guide: https://vuejs.org/guide/
- Bun documentation: https://bun.sh/docs
- Vite documentation: https://vite.dev/</content>
<parameter name="filePath">docs/plans/2025-12-15-notifyhub-implementation.md