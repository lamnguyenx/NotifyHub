# NotifyHub React Migration with Puck Editability Implementation Plan

## Overview

Migrate the current Vue.js NotifyHub notification dashboard to React, integrating Puck visual editor for drag-and-drop editability of the UI layout while preserving all existing functionality: real-time SSE notifications, audio feedback, connection status display, and API-based clear all feature.

## Current State Analysis

- Vue 3 application using Bootstrap for styling and Vite for build
- Real-time dashboard displaying notifications via Server-Sent Events (/events endpoint)
- Audio notification playback on new alerts with volume control
- Connection status indicator with automatic reconnection
- Clear all functionality via DELETE /api/notifications API call
- Responsive card-based UI with timestamps and bell emoji

## Desired End State

A React application with Puck integration where:
- The dashboard layout is visually editable (drag-and-drop sections, customize styles)
- All original functionality works identically in both edit and live modes
- Users can edit header title, notification card styles, and layout arrangement
- Real-time notifications continue to appear instantly with audio feedback
- Build process remains Vite-based with static asset output
- Application is fully functional without Puck editor (render-only mode)

### Key Discoveries:
- Puck uses component configs with fields/render functions to enable editing
- DropZone allows nested drag-and-drop layouts for dashboard sections
- Puck components remain standard React, preserving hooks for SSE/audio logic
- Tailwind CSS is preferred in Puck examples for styling editable components
- Existing Python server endpoints (/events, /api/notifications) remain unchanged

## What We're NOT Doing

- Changing the backend server or API endpoints
- Adding new features beyond Puck editability
- Implementing user authentication or multi-user editing
- Migrating to a different build tool (staying with Vite)
- Adding routing or multi-page functionality

## Implementation Approach

1. Set up React environment with Puck and Tailwind using Vite
2. Define Puck components for each editable dashboard section
3. Migrate Vue logic to React hooks (SSE connection, audio, state)
4. Implement editing mode with data persistence
5. Test preservation of all original functionality

## Phase 1: Environment Setup

### Overview
Install React dependencies, configure Puck, set up Tailwind CSS, and update build configuration.

### Changes Required:

#### 1. Package Dependencies
**File**: `web/package.json`
**Changes**: Replace Vue dependencies with React, add Puck and Tailwind.

```json
{
  "dependencies": {
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "@measured/puck": "^0.15.0"
  },
  "devDependencies": {
    "@vitejs/plugin-react": "^4.2.0",
    "tailwindcss": "^3.4.0",
    "autoprefixer": "^10.4.0",
    "postcss": "^8.4.0"
  }
}
```

#### 2. Vite Configuration
**File**: `web/vite.config.js`
**Changes**: Replace Vue plugin with React plugin.

```js
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'static',
    rollupOptions: {
      input: 'src/main.jsx',
      output: {
        entryFileNames: 'app.js',
        chunkFileNames: '[name].js',
        assetFileNames: '[name].[ext]'
      }
    }
  }
})
```

#### 3. Tailwind Configuration
**File**: `web/tailwind.config.js` (new)
**Changes**: Basic Tailwind setup for Puck compatibility.

```js
/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {},
  },
  plugins: [],
}
```

#### 4. PostCSS Configuration
**File**: `web/postcss.config.js` (new)
**Changes**: Enable Tailwind processing.

```js
export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
}
```

#### 5. Main Entry Point
**File**: `web/src/main.jsx` (renamed from main.js)
**Changes**: React app initialization.

```jsx
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'

ReactDOM.createRoot(document.getElementById('app')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
```

#### 6. Global Styles
**File**: `web/src/index.css` (new)
**Changes**: Tailwind directives and Puck styles.

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

@import "@measured/puck/puck.css";
```

### Success Criteria:

#### Automated Verification:
- [ ] React app builds successfully: `npm run build`
- [ ] TypeScript checking passes (if added later): `npm run typecheck`
- [ ] Tailwind CSS compiles without errors
- [ ] Puck editor renders in development: `npm run dev`

#### Manual Verification:
- [ ] Basic React component renders in browser
- [ ] Puck CSS styles load correctly
- [ ] Tailwind utilities work (test with sample classes)

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the basic React setup works before proceeding to the next phase.

---

## Phase 2: Core Component Migration

### Overview
Convert Vue components to React with Puck configurations for editability. Create Puck components for Header, NotificationList, and ConnectionStatus sections.

### Changes Required:

#### 1. Puck Configuration
**File**: `web/src/puck-config.js` (new)
**Changes**: Define editable components with fields and render functions.

```js
import { DropZone } from "@measured/puck";

export const config = {
  components: {
    Header: {
      fields: {
        title: {
          type: "text",
          label: "Dashboard Title"
        },
        showBell: {
          type: "radio",
          options: [
            { label: "Show", value: true },
            { label: "Hide", value: false }
          ]
        }
      },
      defaultProps: {
        title: "🔔 NotifyHub",
        showBell: true
      },
      render: ({ title, showBell }) => (
        <h1 className={`mb-4 text-2xl font-bold ${showBell ? '' : 'text-center'}`}>
          {showBell ? title : title.replace('🔔 ', '')}
        </h1>
      )
    },
    ConnectionStatus: {
      fields: {
        showBanner: {
          type: "radio",
          options: [
            { label: "Show", value: true },
            { label: "Hide", value: false }
          ]
        }
      },
      defaultProps: {
        showBanner: true
      },
      render: ({ showBanner, connectionError }) => (
        showBanner && connectionError ? (
          <div className="alert alert-warning mb-3">
            Connection lost - retrying...
          </div>
        ) : null
      )
    },
    NotificationList: {
      fields: {
        cardStyle: {
          type: "select",
          options: [
            { label: "White Cards", value: "white" },
            { label: "Gray Cards", value: "gray" },
            { label: "Bordered Cards", value: "bordered" }
          ]
        },
        maxWidth: {
          type: "text",
          label: "Max Card Width"
        }
      },
      defaultProps: {
        cardStyle: "white",
        maxWidth: "95%"
      },
      render: ({ cardStyle, maxWidth, notifications, formatDate }) => (
        <div className="row">
          <div className="col-12 px-2">
            <div className="flex justify-end mb-3">
              <button
                onClick={clearAllNotifications}
                className="btn btn-outline-danger btn-sm"
                disabled={notifications.length === 0}
              >
                Clear All
              </button>
            </div>
            <div>
              {notifications.map(notification => (
                <div
                  key={notification.id}
                  className={`card mb-2 mx-auto ${
                    cardStyle === 'white' ? 'bg-white' :
                    cardStyle === 'gray' ? 'bg-gray-100' :
                    'border border-gray-300'
                  }`}
                  style={{ width: maxWidth, maxWidth }}
                >
                  <div className="card-body">
                    <div className="flex justify-between">
                      <div>
                        <h6 className="card-title font-bold">{notification.message}</h6>
                        <small className="text-muted">
                          {formatDate(notification.timestamp)}
                        </small>
                      </div>
                      <span className="text-primary">🔔</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )
    },
    Dashboard: {
      fields: {},
      render: ({ children }) => (
        <div className="container mt-4">
          <DropZone zone="content" />
        </div>
      )
    }
  }
};
```

#### 2. Root Puck Component
**File**: `web/src/App.jsx` (renamed from App.vue)
**Changes**: Main app with Puck integration and state management.

```jsx
import React, { useState, useEffect, useRef } from 'react';
import { Puck, Render } from "@measured/puck";
import { config } from './puck-config.js';

function App() {
  const [notifications, setNotifications] = useState([]);
  const [connectionError, setConnectionError] = useState(false);
  const [eventSource, setEventSource] = useState(null);
  const audioRef = useRef(null);
  const [isEditing, setIsEditing] = useState(false);
  const [puckData, setPuckData] = useState({
    content: [
      {
        type: "Header",
        props: { id: "header", title: "🔔 NotifyHub", showBell: true }
      },
      {
        type: "ConnectionStatus",
        props: { id: "status", showBanner: true }
      },
      {
        type: "NotificationList",
        props: {
          id: "list",
          cardStyle: "white",
          maxWidth: "95%"
        }
      }
    ],
    root: {}
  });

  // Audio setup
  useEffect(() => {
    audioRef.current = new Audio('/static/audio/Submarine.mp3');
    audioRef.current.volume = 0.3;
    audioRef.current.load();
  }, []);

  // SSE connection
  const connectSSE = () => {
    setConnectionError(false);
    const es = new EventSource('/events');
    setEventSource(es);

    es.onmessage = (event) => {
      console.log('SSE message received:', event.data);
    };

    es.addEventListener('init', (event) => {
      const initData = JSON.parse(event.data);
      setNotifications(initData);
      setConnectionError(false);
    });

    es.addEventListener('notification', (event) => {
      const notification = JSON.parse(event.data);
      setNotifications(prev => [notification, ...prev]);
      if (audioRef.current) {
        audioRef.current.currentTime = 0;
        audioRef.current.play().catch(e => console.log('Audio play failed:', e));
      }
      setConnectionError(false);
    });

    es.addEventListener('clear', (event) => {
      setNotifications([]);
      setConnectionError(false);
    });

    es.addEventListener('heartbeat', (event) => {
      setConnectionError(false);
    });

    es.onerror = (error) => {
      console.error('SSE connection error:', error);
      setConnectionError(true);
    };

    es.onopen = () => {
      console.log('SSE connection opened');
      setConnectionError(false);
    };
  };

  useEffect(() => {
    connectSSE();
    return () => {
      if (eventSource) {
        eventSource.close();
      }
    };
  }, []);

  const formatDate = (timestamp) => {
    return new Date(timestamp).toLocaleString();
  };

  const clearAllNotifications = async () => {
    try {
      const response = await fetch('/api/notifications', {
        method: 'DELETE'
      });
      if (response.ok) {
        // Server will broadcast clear event
      } else {
        console.error('Failed to clear notifications on server');
        setNotifications([]);
      }
    } catch (error) {
      console.error('Error clearing notifications:', error);
      setNotifications([]);
    }
  };

  const savePuckData = (data) => {
    setPuckData(data);
    // In a real app, save to API/database
    localStorage.setItem('puckData', JSON.stringify(data));
  };

  // Load saved Puck data on mount
  useEffect(() => {
    const saved = localStorage.getItem('puckData');
    if (saved) {
      setPuckData(JSON.parse(saved));
    }
  }, []);

  if (isEditing) {
    return (
      <Puck
        config={config}
        data={puckData}
        onPublish={savePuckData}
        onChange={setPuckData}
      />
    );
  }

  return (
    <Render
      config={{
        ...config,
        components: {
          ...config.components,
          Header: {
            ...config.components.Header,
            render: (props) => config.components.Header.render({ ...props, connectionError })
          },
          ConnectionStatus: {
            ...config.components.ConnectionStatus,
            render: (props) => config.components.ConnectionStatus.render({ ...props, connectionError })
          },
          NotificationList: {
            ...config.components.NotificationList,
            render: (props) => config.components.NotificationList.render({
              ...props,
              notifications,
              formatDate,
              clearAllNotifications
            })
          }
        }
      }}
      data={puckData}
    />
  );
}

export default App;
```

### Success Criteria:

#### Automated Verification:
- [ ] React components compile without errors: `npm run build`
- [ ] Puck config validates correctly (no missing fields/render)
- [ ] Tailwind classes apply in rendered components

#### Manual Verification:
- [ ] Header component renders with editable title
- [ ] NotificationList displays cards with correct styling
- [ ] ConnectionStatus shows/hides based on error state
- [ ] Drag-and-drop works in Puck editor mode

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the core components migrate successfully and Puck editing works before proceeding to the next phase.

---

## Phase 3: Real-time Feature Integration

### Overview
Ensure SSE connection, audio playback, and state management work correctly in the React/Puck setup.

### Changes Required:

#### 1. Audio Preloading and Playback
**File**: `web/src/App.jsx`
**Changes**: Verified audio setup in useEffect.

```jsx
// Already implemented in Phase 2
useEffect(() => {
  audioRef.current = new Audio('/static/audio/Submarine.mp3');
  audioRef.current.volume = 0.3;
  audioRef.current.load();
}, []);
```

#### 2. SSE Connection Management
**File**: `web/src/App.jsx`
**Changes**: Verified SSE logic in useEffect and event handlers.

```jsx
// Already implemented in Phase 2 - connectSSE function and useEffect
```

#### 3. State Synchronization
**File**: `web/src/App.jsx`
**Changes**: Verified state updates for notifications and connection status.

```jsx
// Already implemented in Phase 2 - setNotifications and setConnectionError calls
```

### Success Criteria:

#### Automated Verification:
- [ ] Build completes without console errors: `npm run build`
- [ ] Component renders without React warnings

#### Manual Verification:
- [ ] SSE connects successfully (check network tab for /events)
- [ ] New notifications appear instantly with audio playback
- [ ] Connection status updates on disconnect/reconnect
- [ ] Clear all removes all notifications and syncs across tabs

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that real-time features work identically to the original Vue app before proceeding to the next phase.

---

## Phase 4: Puck Editor Integration

### Overview
Add toggle between edit and live modes, implement data persistence, and ensure editing doesn't break functionality.

### Changes Required:

#### 1. Edit Mode Toggle
**File**: `web/src/App.jsx`
**Changes**: Add button to switch between edit and render modes.

```jsx
// Add to render function
<div className="fixed top-4 right-4 z-50">
  <button
    onClick={() => setIsEditing(!isEditing)}
    className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded"
  >
    {isEditing ? 'View Live' : 'Edit Layout'}
  </button>
</div>
```

#### 2. Data Persistence
**File**: `web/src/App.jsx`
**Changes**: Save/load Puck data from localStorage (placeholder for API integration).

```jsx
// Already implemented in Phase 2 - savePuckData and useEffect for loading
```

### Success Criteria:

#### Automated Verification:
- [ ] Edit mode toggle doesn't cause React errors
- [ ] Puck data saves/loads from localStorage

#### Manual Verification:
- [ ] Edit mode allows drag-and-drop component rearrangement
- [ ] Changes persist after page refresh
- [ ] Live mode shows updated layout
- [ ] Real-time notifications work in both modes

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that Puck editing integration works correctly before proceeding to the next phase.

---

## Phase 5: Testing & Verification

### Overview
Run comprehensive tests to ensure all functionality is preserved and Puck integration works correctly.

### Changes Required:

#### 1. Update Test Scripts
**File**: `web/package.json`
**Changes**: Add test scripts if needed.

```json
{
  "scripts": {
    "test": "echo 'No tests yet'",
    "lint": "echo 'No linting configured'"
  }
}
```

### Success Criteria:

#### Automated Verification:
- [ ] Application builds successfully: `npm run build`
- [ ] No runtime errors in console during normal operation

#### Manual Verification:
- [ ] All original Vue functionality works: SSE notifications, audio, clear all, connection status
- [ ] Puck editing allows layout customization without breaking functionality
- [ ] Responsive design works on mobile/desktop
- [ ] Performance is acceptable with 100+ notifications

## Testing Strategy

### Unit Tests:
- Component rendering tests for Puck configs
- State management tests for notifications
- Audio API interaction tests

### Integration Tests:
- SSE connection and message handling
- API calls for clear all functionality
- Puck data persistence

### Manual Testing Steps:
1. Load the application and verify initial state (no notifications, connected)
2. Send test notifications and confirm they appear with audio
3. Test connection loss/recovery scenarios
4. Enter edit mode and customize header title, card styles
5. Save changes and verify persistence on page reload
6. Test clear all functionality and cross-tab synchronization
7. Verify responsive behavior on different screen sizes

## Performance Considerations

- Audio preloading to prevent delays
- Efficient re-rendering with React.memo for Puck components
- SSE connection management to prevent memory leaks
- Tailwind CSS purging in production build

## Migration Notes

- Backend server remains unchanged - no impact on existing API endpoints
- Audio files copied from Vue public directory
- Vite build output maintains same static structure
- localStorage used for Puck data (upgrade to API persistence later)

## References

- Puck documentation: https://puckeditor.com/docs
- Puck demo: https://demo.puckeditor.com/edit
- Tailwind CSS: https://tailwindcss.com/docs
- Original Vue implementation: web/src/App.vue</content>
<parameter name="filePath">docs/plans/2025-12-17-notifyhub-react-puck-migration.md