# Switch Backend from Python to JavaScript Implementation Plan

## Overview

This plan outlines the migration of NotifyHub's backend from Python/FastAPI to JavaScript/Node.js with Express.js and TypeScript. The goal is to maintain identical functionality while modernizing the tech stack and improving development experience.

## Current State Analysis

The current Python backend provides:
- REST API for notification CRUD operations
- Server-Sent Events (SSE) for real-time updates
- Static file serving for the React frontend
- In-memory notification storage (max 1000 items)
- CORS support and error handling

**Key dependencies:** FastAPI, uvicorn, sse-starlette, pydantic

## Desired End State

After implementation:
- JavaScript/TypeScript backend with identical API surface
- Same SSE real-time functionality
- Maintained frontend compatibility
- Improved development workflow with hot-reload
- Jest test suite replacing pytest
- Updated build system supporting both Python and JS backends

### Key Discoveries:
- Current API: `POST /api/notify`, `GET /api/notifications`, `DELETE /api/notifications`, `GET /events` (SSE), `GET /` (frontend)
- SSE events: "notification", "delete", "clear", "init", "heartbeat", "shutdown"
- Notification model: {id, message, pwd?, timestamp}
- Storage: in-memory array, newest-first ordering, max 1000 items
- Frontend expects same API contracts and SSE event formats

## What We're NOT Doing

- Changing the frontend API contracts or SSE event formats
- Modifying notification data structure or business logic
- Replacing the React frontend tech stack
- Adding new features or breaking changes

## Implementation Approach

Migrate incrementally by:
1. Creating parallel JavaScript backend alongside Python
2. Implementing identical functionality with modern JS libraries
3. Converting tests and updating build system
4. Testing for API compatibility
5. Deprecating Python backend

## Phase 1: JavaScript Backend Foundation

### Overview
Set up the basic Express.js server with TypeScript, install dependencies, and implement core server setup.

### Changes Required:

#### 1. Create JavaScript Backend Structure
**File**: `src/notifyhub/backend-js/`
**Changes**: Create new directory structure mirroring Python backend

```bash
mkdir -p src/notifyhub/backend-js
cd src/notifyhub/backend-js
```

#### 2. Set up package.json
**File**: `src/notifyhub/backend-js/package.json`
**Changes**: Create package.json with Express, better-sse, and development dependencies

```json
{
  "name": "notifyhub-backend-js",
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "start": "node dist/server.js",
    "dev": "tsx watch src/server.ts",
    "build": "tsc",
    "test": "jest"
  },
  "dependencies": {
    "express": "^4.18.0",
    "cors": "^2.8.5",
    "better-sse": "^0.15.0",
    "uuid": "^9.0.0"
  },
  "devDependencies": {
    "@types/express": "^4.17.0",
    "@types/cors": "^2.8.0",
    "@types/uuid": "^9.0.0",
    "@types/node": "^20.0.0",
    "typescript": "^5.0.0",
    "tsx": "^4.0.0",
    "jest": "^29.0.0",
    "@types/jest": "^29.0.0"
  }
}
```

#### 3. Set up TypeScript configuration
**File**: `src/notifyhub/backend-js/tsconfig.json`
**Changes**: Basic TypeScript config for Node.js

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "node",
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

#### 4. Create TypeScript interfaces
**File**: `src/notifyhub/backend-js/src/types.ts`
**Changes**: Define notification types matching Python models

```typescript
export interface Notification {
  id?: string;
  message: string;
  pwd?: string;
  timestamp?: string;
}

export interface NotificationResponse {
  id: string;
  data: Omit<Notification, 'id' | 'timestamp'>;
  timestamp: string;
}

export interface NotifyRequest {
  id?: string;
  data: Notification;
}

export interface ApiResponse {
  success: boolean;
  id?: string;
  message?: string;
}
```

### Success Criteria:

#### Automated Verification:
- [ ] TypeScript compilation passes: `npm run build`
- [ ] Dependencies install successfully: `npm install`
- [ ] Basic server starts without errors: `npm run dev`

#### Manual Verification:
- [ ] Server responds to health check requests
- [ ] No TypeScript compilation errors
- [ ] Package.json scripts work correctly

---

## Phase 2: Notification Storage and Models

### Overview
Implement the notification storage logic and data models to match Python backend behavior.

### Changes Required:

#### 1. Create Notification Store
**File**: `src/notifyhub/backend-js/src/store.ts`
**Changes**: Implement in-memory storage with same logic as Python

```typescript
import { Notification, NotificationResponse } from './types.js';

export class NotificationStore {
  private notifications: Notification[] = [];
  private readonly maxNotifications = 1000;

  add(data: Notification, customId?: string): string {
    if (customId) {
      data.id = customId;
    } else if (!data.id) {
      data.id = this.generateId();
    }

    if (!data.timestamp) {
      data.timestamp = new Date().toISOString();
    }

    // Insert at beginning (newest first)
    this.notifications.unshift(data);

    // Maintain max limit
    if (this.notifications.length > this.maxNotifications) {
      this.notifications.pop();
    }

    return data.id!;
  }

  getAll(): NotificationResponse[] {
    return this.notifications.map(n => ({
      id: n.id!,
      data: {
        message: n.message,
        pwd: n.pwd
      },
      timestamp: n.timestamp!
    }));
  }

  deleteById(id: string): boolean {
    const index = this.notifications.findIndex(n => n.id === id);
    if (index !== -1) {
      this.notifications.splice(index, 1);
      return true;
    }
    return false;
  }

  clearAll(): void {
    this.notifications = [];
  }

  private generateId(): string {
    const timestamp = new Date().toISOString().replace(/[:-]/g, '').replace(/\..+/, '');
    const uuid = crypto.randomUUID().slice(0, 8);
    return `${timestamp}-${uuid}`;
  }
}
```

### Success Criteria:

#### Automated Verification:
- [ ] TypeScript compilation passes: `npm run build`
- [ ] Unit tests pass for store operations

#### Manual Verification:
- [ ] Store correctly adds notifications with timestamps
- [ ] Store maintains max 1000 item limit
- [ ] Store returns notifications in correct order (newest first)
- [ ] Delete operations work correctly

---

## Phase 3: SSE Manager Implementation

### Overview
Implement Server-Sent Events manager using better-sse library to match Python SSE functionality.

### Changes Required:

#### 1. Create SSE Manager
**File**: `src/notifyhub/backend-js/src/sse.ts`
**Changes**: SSE connection management and broadcasting

```typescript
import { createSession, Session } from 'better-sse';

export class SSEManager {
  private sessions: Session[] = [];

  async connect(req: any, res: any): Promise<Session> {
    const session = await createSession(req, res);
    this.sessions.push(session);

    // Handle disconnection
    session.req.on('close', () => {
      const index = this.sessions.indexOf(session);
      if (index !== -1) {
        this.sessions.splice(index, 1);
      }
    });

    return session;
  }

  async broadcast(eventType: string, data: any): Promise<void> {
    const disconnected: Session[] = [];

    for (const session of this.sessions) {
      try {
        await session.push(data, eventType);
      } catch (error) {
        disconnected.push(session);
      }
    }

    // Clean up disconnected sessions
    for (const session of disconnected) {
      const index = this.sessions.indexOf(session);
      if (index !== -1) {
        this.sessions.splice(index, 1);
      }
    }
  }

  async sendInitData(session: Session, notifications: any[]): Promise<void> {
    await session.push(notifications, 'init');
  }
}
```

### Success Criteria:

#### Automated Verification:
- [ ] TypeScript compilation passes: `npm run build`
- [ ] SSE connection handling works without errors

#### Manual Verification:
- [ ] SSE manager accepts connections
- [ ] Broadcast sends events to all connected clients
- [ ] Disconnected clients are cleaned up properly

---

## Phase 4: Express API Routes

### Overview
Implement all REST API endpoints to match Python backend exactly.

### Changes Required:

#### 1. Create Express Server
**File**: `src/notifyhub/backend-js/src/server.ts`
**Changes**: Main Express server with all routes

```typescript
import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { NotificationStore } from './store.js';
import { SSEManager } from './sse.js';
import { NotifyRequest, ApiResponse } from './types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const sseManager = new SSEManager();
const store = new NotificationStore();

// Middleware
app.use(cors());
app.use(express.json());

// Static files
const frontendDir = path.join(__dirname, '../../frontend');
app.use('/static', express.static(path.join(frontendDir, 'dist')));
app.use('/icons', express.static(path.join(frontendDir, 'dist/icons')));
app.use('/audio', express.static(path.join(frontendDir, 'dist/audio')));

// API Routes
app.post('/api/notify', (req, res) => {
  try {
    const request: NotifyRequest = req.body;
    const notificationId = store.add(request.data, request.id);

    // Broadcast to SSE clients
    sseManager.broadcast('notification', {
      id: request.data.id || notificationId,
      data: {
        message: request.data.message,
        pwd: request.data.pwd
      },
      timestamp: request.data.timestamp || new Date().toISOString()
    });

    const response: ApiResponse = { success: true, id: notificationId };
    res.json(response);
  } catch (error) {
    res.status(400).json({ error: (error as Error).message });
  }
});

app.get('/api/notifications', (req, res) => {
  res.json(store.getAll());
});

app.delete('/api/notifications', (req, res) => {
  const id = req.query.id as string;

  if (id) {
    // Delete specific notification
    if (store.deleteById(id)) {
      sseManager.broadcast('delete', { id, message: `Notification ${id} deleted` });
      const response: ApiResponse = { success: true, message: `Notification ${id} deleted` };
      res.json(response);
    } else {
      res.status(404).json({ detail: 'Notification not found' });
    }
  } else {
    // Clear all notifications
    store.clearAll();
    sseManager.broadcast('clear', { message: 'All notifications cleared' });
    const response: ApiResponse = { success: true, message: 'All notifications cleared' };
    res.json(response);
  }
});

// SSE endpoint
app.get('/events', async (req, res) => {
  const session = await sseManager.connect(req, res);

  // Send current notifications
  const currentNotifications = store.getAll();
  await sseManager.sendInitData(session, currentNotifications);

  // Heartbeat every 30 seconds
  const heartbeatInterval = setInterval(() => {
    session.push({ timestamp: new Date().toISOString() }, 'heartbeat');
  }, 30000);

  // Clean up on disconnect
  session.req.on('close', () => {
    clearInterval(heartbeatInterval);
  });
});

// Root endpoint - serve frontend
app.get('/', (req, res) => {
  // For now, just return a placeholder
  res.send('NotifyHub JavaScript Backend - Frontend integration pending');
});

const PORT = process.env.PORT || 9080;
app.listen(PORT, () => {
  console.log(`NotifyHub JavaScript backend listening on port ${PORT}`);
});
```

### Success Criteria:

#### Automated Verification:
- [ ] All API endpoints respond correctly
- [ ] SSE endpoint establishes connections
- [ ] CORS headers are set properly

#### Manual Verification:
- [ ] POST /api/notify creates notifications
- [ ] GET /api/notifications returns notification list
- [ ] DELETE /api/notifications removes notifications
- [ ] GET /events establishes SSE connection
- [ ] API responses match Python backend format exactly

---

## Phase 5: Testing and Build System Updates

### Overview
Convert Python tests to Jest and update build system to support both backends.

### Changes Required:

#### 1. Convert Tests to Jest
**File**: `src/notifyhub/backend-js/src/__tests__/server.test.ts`
**Changes**: Convert pytest tests to Jest format

#### 2. Update Makefile
**File**: `Makefile`
**Changes**: Add JavaScript backend targets

```makefile
backend-js bejs:
	cd src/notifyhub/backend-js && npm run dev

test-backend-js tbejs:
	cd src/notifyhub/backend-js && npm test
```

### Success Criteria:

#### Automated Verification:
- [ ] All Jest tests pass
- [ ] Build system targets work: `make backend-js`, `make test-backend-js`

#### Manual Verification:
- [ ] Test coverage matches Python backend tests
- [ ] API compatibility verified through integration tests

---

## Testing Strategy

### Unit Tests:
- Notification store operations (add, delete, clear)
- SSE manager connection handling
- API route request/response validation
- Error handling edge cases

### Integration Tests:
- Full API workflow testing
- SSE event broadcasting verification
- Frontend integration testing

### Manual Testing Steps:
1. Start JavaScript backend: `make backend-js`
2. Send test notifications via API
3. Verify SSE events are received
4. Test frontend integration
5. Compare behavior with Python backend

## Performance Considerations

- JavaScript backend should have similar performance to Python
- Monitor memory usage with in-memory storage
- Consider connection pooling for SSE clients

## Migration Notes

- Keep Python backend as fallback during transition
- Update documentation to reference JavaScript backend
- Train team on new development workflow
- Update CI/CD pipelines for JavaScript tooling

## References

- Current Python backend: `src/notifyhub/backend/backend.py`
- Python tests: `src/notifyhub/backend/__tests__/`
- Frontend expectations: `src/notifyhub/frontend/`
- better-sse documentation: https://github.com/MatthewWid/better-sse