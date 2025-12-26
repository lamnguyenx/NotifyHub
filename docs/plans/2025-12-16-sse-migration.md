# SSE Migration Implementation Plan

## Overview

Migrate NotifyHub from HTTP polling to Server-Sent Events (SSE) for faster, more efficient real-time notification delivery. This eliminates the 2-second polling delay and reduces server load while maintaining simplicity over WebSocket implementation.

## Current State Analysis

**Current Implementation:**
- HTTP polling every 2 seconds via `GET /api/notifications`
- Client makes constant requests regardless of new notifications
- ~500ms average latency for new notification delivery
- High server load from polling traffic
- Simple but inefficient architecture

**Performance Issues:**
- Unnecessary server requests every 2 seconds
- Higher latency than real-time systems
- Increased server CPU and bandwidth usage
- Battery drain on mobile devices

## Desired End State

A real-time notification system using SSE where:
- New notifications appear instantly (< 100ms delivery)
- No polling - server pushes updates to connected clients
- Automatic reconnection on connection loss
- Reduced server load and bandwidth usage
- Backward compatibility with existing REST API

### Key Discoveries:
- SSE is perfect for notifications (server-to-client push only)
- `sse-starlette` is the most mature FastAPI SSE library
- Automatic browser reconnection eliminates complex client logic
- EventSource API provides simple client-side integration
- Maintains HTTP/1.1 compatibility (better than WebSocket for some networks)

## What We're NOT Doing

- WebSocket implementation (too complex for this use case)
- Reducing polling interval (doesn't solve the fundamental inefficiency)
- Multiple notification channels or user targeting
- Authentication/authorization for SSE connections
- Binary data or bidirectional communication

## Implementation Approach

Use SSE with connection manager pattern:
- Server maintains list of active SSE connections
- New notifications broadcast to all connected clients immediately
- Clients use EventSource for automatic reconnection
- Graceful degradation to polling if SSE fails

## Testing Notes

**Important**: Server must be started in background (`&`) for testing, as it runs continuously. Use commands like:
- `python -m notifyhub.server --port 9080 &` to start server
- `pkill -f "notifyhub.server"` to stop server
- Test SSE with: `curl -H "Accept: text/event-stream" http://localhost:9080/events`

## Phase 1: Server-Side SSE Infrastructure

### Overview
Add SSE dependency and connection management to the FastAPI server.

### Changes Required:

#### 1. Add SSE Dependency
**File**: `requirements.txt`
**Changes**: Add sse-starlette for FastAPI SSE support

```txt
fastapi
uvicorn
jinja2
python-multipart
aiofiles
requests
sse-starlette
```

#### 2. SSE Connection Manager
**File**: `notifyhub/server.py`
**Changes**: Add connection manager class to track active SSE clients

```python
from sse_starlette.sse import EventSourceResponse
import asyncio
from typing import List
import logging

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
```

#### 3. SSE Endpoint
**File**: `notifyhub/server.py`
**Changes**: Add `/events` endpoint that streams notifications via SSE

```python
# Add to global scope
sse_manager = SSEManager()

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
            yield {"event": "init", "data": current_notifications}
            
            # Stream new notifications
            while True:
                event_data = await queue.get()
                yield event_data
                
        except asyncio.CancelledError:
            sse_manager.disconnect(queue)
            raise
            
    return EventSourceResponse(event_generator())
```

#### 4. Broadcast on New Notifications
**File**: `notifyhub/models.py`
**Changes**: Modify NotificationStore to broadcast via SSE manager

```python
class NotificationStore:
    def __init__(self, sse_manager: Optional[SSEManager] = None):
        self.notifications: List[Notification] = []
        self.max_notifications = 1000
        self.sse_manager = sse_manager
        
    def add(self, message: str) -> str:
        notification = Notification(message)
        self.notifications.insert(0, notification)  # Newest first
        
        # Broadcast to SSE clients
        if self.sse_manager:
            event_data = {
                "event": "notification",
                "data": {
                    "id": notification.id,
                    "message": notification.message,
                    "timestamp": notification.timestamp.isoformat()
                }
            }
            # Schedule broadcast (don't block notification creation)
            asyncio.create_task(self.sse_manager.broadcast(event_data))
        
        if len(self.notifications) > self.max_notifications:
            self.notifications.pop()
            
        return notification.id
```

#### 5. Update Server Initialization
**File**: `notifyhub/server.py`
**Changes**: Wire up SSE manager to notification store

```python
# Update global initialization
sse_manager = SSEManager()
store = NotificationStore(sse_manager=sse_manager)
```

### Success Criteria:

#### Automated Verification:
- [ ] SSE dependency installs: `pip install -e .`
- [ ] Server starts successfully with SSE endpoint: `python -m notifyhub.server --port 9080 &`
- [ ] SSE endpoint responds: `curl -H "Accept: text/event-stream" http://localhost:9080/events`
- [ ] New notifications appear in SSE stream when sent via REST API

#### Manual Verification:
- [ ] SSE connections can be established from browser
- [ ] Multiple SSE connections work simultaneously
- [ ] Server logs show proper connection management

**Implementation Note**: After completing this phase, pause for manual verification that SSE streaming works before proceeding to client-side changes.

---

## Phase 2: Client-Side SSE Integration

### Overview
Replace HTTP polling with EventSource SSE connection in the Vue.js frontend.

### Changes Required:

#### 1. Vue.js SSE Integration
**File**: `notifyhub/frontend/src/App.vue`
**Changes**: Replace polling with EventSource for real-time updates

```vue
<template>
  <div class="container mt-4">
    <h1 class="mb-4">🔔 NotifyHub</h1>
    <div v-if="connectionError" class="alert alert-warning">
      Connection lost - attempting to reconnect...
    </div>
    <div v-if="notifications.length === 0 && !connectionError" class="text-center text-muted">
      No notifications yet
    </div>
    <div v-else-if="!connectionError" class="row">
      <div class="col-md-8 mx-auto">
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
      </div>
    </div>
  </div>
</template>

<script>
export default {
  data() {
    return {
      notifications: [],
      eventSource: null,
      connectionError: false,
      audio: null
    }
  },
  mounted() {
    // Preload audio
    this.audio = new Audio('/static/audio/Submarine.mp3');
    this.audio.volume = 0.3;
    this.audio.load();

    this.connectSSE();
  },
  beforeUnmount() {
    if (this.eventSource) {
      this.eventSource.close();
    }
  },
  methods: {
    connectSSE() {
      this.connectionError = false;
      this.eventSource = new EventSource('/events');

      this.eventSource.onmessage = (event) => {
        console.log('SSE message received:', event.data);
      };

      this.eventSource.addEventListener('init', (event) => {
        // Handle initial notification load
        const initData = JSON.parse(event.data);
        this.notifications = initData;
        this.connectionError = false;
      });

      this.eventSource.addEventListener('notification', (event) => {
        // Handle new notification
        const notification = JSON.parse(event.data);
        this.notifications.unshift(notification); // Add to beginning
        this.playNotificationSound();
        this.connectionError = false;
      });

      this.eventSource.onerror = (error) => {
        console.error('SSE connection error:', error);
        this.connectionError = true;

        // EventSource automatically attempts reconnection
        // But we can add custom retry logic if needed
      };

      this.eventSource.onopen = () => {
        console.log('SSE connection opened');
        this.connectionError = false;
      };
    },
    playNotificationSound() {
      if (this.audio) {
        this.audio.currentTime = 0; // Reset to start
        this.audio.play().catch(e => console.log('Audio play failed:', e));
      }
    },
    formatDate(timestamp) {
      return new Date(timestamp).toLocaleString();
    }
  }
}
</script>
```

#### 2. Remove Polling Logic
**File**: `notifyhub/frontend/src/App.vue`
**Changes**: Remove the old polling code and interval

```javascript
// Remove this from mounted():
// this.fetchNotifications();
// setInterval(this.fetchNotifications, 2000);

// Remove this method:
// async fetchNotifications() { ... }
```

### Success Criteria:

#### Automated Verification:
- [ ] Vue.js builds successfully: `cd web && bun run build`
- [ ] Web assets generated in static/ directory
- [ ] Server serves updated Vue app with SSE integration

#### Manual Verification:
- [ ] Server starts successfully: `python -m notifyhub.server --port 9080 &`
- [ ] SSE connection establishes: Browser console shows "SSE connection opened"
- [ ] Notifications appear instantly: Send via CLI, verify < 100ms delivery
- [ ] No polling delay: Confirm no 2-second intervals in network tab
- [ ] Audio plays on new notifications
- [ ] Connection error handling: Disconnect network, see error message, reconnect works

**Implementation Note**: After completing this phase, test that the full end-to-end flow works: CLI → Server → SSE → Browser.

---

## Phase 3: Fallback and Polish

### Overview
Add fallback mechanisms and improve error handling for production readiness.

### Changes Required:

#### 1. Graceful Fallback to Polling
**File**: `notifyhub/frontend/src/App.vue`
**Changes**: Add polling fallback when SSE fails

```javascript
methods: {
  // Add to existing methods
  startPollingFallback() {
    // Fallback to polling if SSE completely fails
    this.pollingInterval = setInterval(async () => {
      if (this.connectionError) {
        try {
          const response = await fetch('/api/notifications');
          if (response.ok) {
            const newNotifications = await response.json();
            this.updateNotifications(newNotifications);
          }
        } catch (error) {
          console.error('Polling fallback failed:', error);
        }
      }
    }, 10000); // Poll every 10 seconds as fallback
  },

  updateNotifications(newNotifications) {
    // Update notifications, detecting new ones
    const previousCount = this.notifications.length;
    this.notifications = newNotifications;

    if (this.notifications.length > previousCount) {
      this.playNotificationSound();
    }
  }
}
```

#### 2. Connection Health Monitoring
**File**: `notifyhub/frontend/src/App.vue`
**Changes**: Add heartbeat monitoring for connection health

```javascript
// Add heartbeat event listener
this.eventSource.addEventListener('heartbeat', (event) => {
  // Server can send periodic heartbeat events
  this.lastHeartbeat = Date.now();
});

// Monitor connection health
setInterval(() => {
  if (this.lastHeartbeat && Date.now() - this.lastHeartbeat > 30000) {
    // No heartbeat for 30 seconds
    this.connectionError = true;
  }
}, 5000);
```

#### 3. Server Heartbeat Events
**File**: `notifyhub/server.py`
**Changes**: Add periodic heartbeat to SSE stream

```python
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
        yield {"event": "init", "data": current_notifications}

        heartbeat_count = 0
        while True:
            # Send heartbeat every 30 seconds
            if heartbeat_count % 30 == 0:
                yield {"event": "heartbeat", "data": {"timestamp": datetime.now().isoformat()}}

            # Wait for new events or timeout for heartbeat
            try:
                event_data = await asyncio.wait_for(queue.get(), timeout=1.0)
                yield event_data
            except asyncio.TimeoutError:
                heartbeat_count += 1
                continue

    except asyncio.CancelledError:
        sse_manager.disconnect(queue)
        raise
```

### Success Criteria:

#### Automated Verification:
- [ ] System works with SSE enabled (primary path)
- [ ] System works with SSE disabled (fallback path)
- [ ] No crashes when network connectivity changes

#### Manual Verification:
- [ ] SSE connection recovers automatically after network interruption
- [ ] Fallback polling works when SSE is disabled
- [ ] No duplicate notifications during reconnection
- [ ] Performance is significantly improved (< 100ms delivery)

**Implementation Note**: This completes the SSE migration. The system now provides real-time notifications with automatic fallback.

---

## Testing Strategy

### Unit Tests:
- Test SSE connection manager (connect/disconnect/broadcast)
- Test notification broadcasting to multiple clients
- Test graceful handling of disconnected clients

### Integration Tests:
- Full end-to-end: CLI → Server → SSE → Browser
- Connection recovery after network interruption
- Multiple concurrent browser connections
- Fallback behavior when SSE fails

### Manual Testing Steps:
1. Start server in background: `notifyhub-server --port 9080 &`
2. Wait 2 seconds for server startup
3. Test SSE endpoint: `curl -H "Accept: text/event-stream" http://localhost:9080/events` (verify streaming)
4. Open browser to http://localhost:9080
5. Send notification: `notifyhub-push --port 9080 "Test message"`
6. Verify instant appearance (< 100ms, no 2-second delay)
7. Test with multiple browser tabs (each gets real-time updates)
8. Disconnect/reconnect network to test resilience
9. Cleanup: `pkill -f "notifyhub.server"`

## Performance Considerations

**Expected Improvements:**
- **Latency**: < 100ms delivery vs 2-second polling
- **Server Load**: ~99% reduction in requests (no polling)
- **Bandwidth**: Significant reduction (no polling responses)
- **Battery Life**: Better on mobile devices

**Monitoring:**
- Track SSE connection count
- Monitor reconnection frequency
- Measure notification delivery latency

## Migration Notes

- **Backward Compatibility**: REST API remains unchanged
- **Zero Downtime**: Can deploy with both polling and SSE simultaneously
- **Rollback**: Can disable SSE and re-enable polling if issues arise
- **Browser Support**: SSE supported in all modern browsers (IE 11+ with polyfill if needed)

## Common Testing Pitfalls

- **Server blocking**: Always start server with `&` for background execution
- **SSE streaming**: Use `curl -H "Accept: text/event-stream"` to test SSE endpoint
- **Timing issues**: Wait 2+ seconds after starting server before testing
- **Multiple connections**: Kill old servers with `pkill -f "notifyhub.server"` before restarting
- **Browser cache**: Hard refresh browser after Vue.js changes

## References

- SSE Specification: https://html.spec.whatwg.org/multipage/server-sent-events.html
- sse-starlette Documentation: https://github.com/sysid/sse-starlette
- FastAPI SSE Examples: https://fastapi.tiangolo.com/tutorial/response-streaming/
- EventSource API: https://developer.mozilla.org/en-US/docs/Web/API/EventSource</content>
<parameter name="filePath">docs/plans/2025-12-16-sse-migration.md