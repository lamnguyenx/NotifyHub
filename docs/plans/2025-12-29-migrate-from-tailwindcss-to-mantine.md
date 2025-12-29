# Migrate from TailwindCSS to Mantine UI Library Implementation Plan

## Overview

Replace TailwindCSS utility classes with Mantine UI components for improved developer experience and consistent design system. This migration will eliminate custom CSS management, provide pre-built accessible components, and improve maintainability by using a unified component library instead of utility classes.

## Current State Analysis

**Current Implementation:**
- TailwindCSS v3.4.0 with PostCSS integration
- Mixed Bootstrap-inspired classes (alert, card, btn) and Tailwind utilities
- Extensive className usage across components (16+ instances)
- Dark mode support via Tailwind's `dark:` prefix
- Custom CSS in `src/index.css` with `@apply` directives

**Key Components to Migrate:**
- Header component: `src/puck-config.jsx:24` (h1 with Tailwind classes)
- Status components: `src/puck-config.jsx:44,65` (alert divs with dark mode)
- NotificationList: `src/puck-config.jsx:92-136` (complex card/button layouts)
- App edit button: `src/App.jsx:176` (button with utility classes)

**Dependencies to Remove:**
- `tailwindcss: ^3.4.0` from package.json
- `tailwind.config.js` and PostCSS Tailwind plugin
- `@tailwind` imports from `src/index.css`

## Desired End State

After this plan is complete:
- All UI components built using Mantine library components
- MantineProvider configured with custom theme matching current color scheme
- Dark mode support through Mantine's colorScheme system
- Zero TailwindCSS classes remaining in codebase
- Consistent component styling and theming
- Improved bundle size and performance

### Key Discoveries:
- Current color scheme uses blue (#3B82F6) for primary, gray variations for backgrounds
- Dark mode implemented with Tailwind's class-based approach
- Layout uses flexbox patterns extensively
- Alert components use yellow/blue color coding for warnings/info

## What We're NOT Doing

- Maintaining any TailwindCSS utility classes
- Keeping hybrid styling approaches
- Preserving Bootstrap class naming conventions
- Supporting Tailwind-specific features like arbitrary values

## Implementation Approach

Full migration strategy replacing all Tailwind classes with Mantine components. We'll install Mantine, set up theming, then systematically replace components starting with infrastructure and moving to UI components. Each phase includes both automated testing and manual UI verification to ensure functionality is preserved.

## Phase 1: Mantine Setup and Core Infrastructure

### Overview
Install Mantine dependencies, configure theme provider, and establish theming system with dark mode support.

### Changes Required:

#### 1. Install Mantine Dependencies
**File**: `notifyhub/frontend/package.json`
**Changes**: Add Mantine packages

```json
{
  "dependencies": {
    "@mantine/core": "^7.0.0",
    "@mantine/hooks": "^7.0.0",
    "@mantine/dates": "^7.0.0"
  }
}
```

#### 2. Create Mantine Theme
**File**: `notifyhub/frontend/src/theme.js` (new)
**Changes**: Define theme matching current color scheme

```javascript
import { createTheme } from '@mantine/core';

export const theme = createTheme({
  colors: {
    blue: ['#eff6ff', '#dbeafe', '#bfdbfe', '#93c5fd', '#60a5fa', '#3b82f6', '#2563eb', '#1d4ed8', '#1e40af', '#1e3a8a', '#172554'],
  },
  primaryColor: 'blue',
  components: {
    Button: {
      defaultProps: {
        size: 'sm',
      },
    },
    Alert: {
      defaultProps: {
        variant: 'light',
      },
    },
  },
});
```

#### 3. Set Up MantineProvider
**File**: `notifyhub/frontend/src/main.jsx`
**Changes**: Wrap App with MantineProvider and ColorSchemeScript

```jsx
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'
import { MantineProvider, ColorSchemeScript } from '@mantine/core';
import { theme } from './theme.js';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <>
      <ColorSchemeScript />
      <MantineProvider theme={theme} defaultColorScheme="auto">
        <App />
      </MantineProvider>
    </>
  </React.StrictMode>,
)
```

### Success Criteria:

#### Automated Verification:
- [ ] Mantine packages installed: `npm list @mantine/core`
- [ ] Project builds successfully: `npm run build`
- [ ] TypeScript compilation passes: `npm run typecheck`
- [ ] Linting passes: `npm run lint`

#### Manual Verification:
- [ ] App renders without Tailwind-related errors
- [ ] Dark mode toggle works via browser/system preference
- [ ] Theme colors match current blue/gray scheme

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation that theming is working correctly before proceeding to component migrations.

## Phase 2: Header and Status Components Migration

### Overview
Migrate Header, ConnectionStatus, and AudioStatus components from Tailwind classes to Mantine Title and Alert components.

### Changes Required:

#### 1. Header Component Migration
**File**: `notifyhub/frontend/src/puck-config.jsx`
**Changes**: Replace h1 with Mantine Title component

```jsx
// Before
<h1 className={`mb-4 text-2xl font-bold dark:text-white ${showBell ? '' : 'text-center'}`}>
  {showBell ? title : title.replace('🔔 ', '')}
</h1>

// After
import { Title } from '@mantine/core';

<Title order={1} mb="md" size="xl" ta={showBell ? 'left' : 'center'}>
  {showBell ? title : title.replace('🔔 ', '')}
</Title>
```

#### 2. ConnectionStatus Component Migration
**File**: `notifyhub/frontend/src/puck-config.jsx`
**Changes**: Replace alert div with Mantine Alert

```jsx
// Before
<div className="alert alert-warning mb-3 dark:bg-yellow-900 dark:text-yellow-100 dark:border-yellow-700">
  Connection lost - retrying...
</div>

// After
import { Alert } from '@mantine/core';

<Alert color="yellow" mb="md" title="Connection Status">
  Connection lost - retrying...
</Alert>
```

#### 3. AudioStatus Component Migration
**File**: `notifyhub/frontend/src/puck-config.jsx`
**Changes**: Replace alert div with Mantine Alert

```jsx
// Before
<div className="alert alert-info mb-3 dark:bg-blue-900 dark:text-blue-100 dark:border-blue-700">
  🔊 Audio notifications are muted. Click anywhere on the page to enable them.
</div>

// After
<Alert color="blue" mb="md" title="Audio Status">
  🔊 Audio notifications are muted. Click anywhere on the page to enable them.
</Alert>
```

### Success Criteria:

#### Automated Verification:
- [ ] Components render without errors: `npm run build`
- [ ] TypeScript types valid: `npm run typecheck`
- [ ] No Tailwind classes in migrated components: `grep -r "className.*dark:" src/`

#### Manual Verification:
- [ ] Header displays correctly in both bell and no-bell modes
- [ ] Status alerts appear with appropriate colors when conditions met
- [ ] Dark mode styling works for all migrated components

## Phase 3: NotificationList Component Migration

### Overview
Migrate the complex NotificationList component, replacing card structures, buttons, and layouts with Mantine equivalents.

### Changes Required:

#### 1. Import Mantine Components
**File**: `notifyhub/frontend/src/puck-config.jsx`
**Changes**: Add Mantine component imports

```jsx
import { Card, Button, Flex, Text, Container, Group } from '@mantine/core';
```

#### 2. Replace Layout Structure
**File**: `notifyhub/frontend/src/puck-config.jsx`
**Changes**: Replace Bootstrap/Tailwind layout with Mantine Container and Flex

```jsx
// Before
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

// After
<Container size="95%" px="xs">
  <Flex justify="flex-end" mb="md">
    <Button
      onClick={clearAllNotifications}
      variant="outline"
      color="red"
      size="xs"
      disabled={notifications.length === 0}
    >
      Clear All
    </Button>
  </Flex>
```

#### 3. Replace Card Structure
**File**: `notifyhub/frontend/src/puck-config.jsx`
**Changes**: Replace card divs with Mantine Card component

```jsx
// Before
<div
  key={notification.id}
  className={`card mb-2 mx-auto ${
    cardStyle === 'white' ? 'bg-white dark:bg-gray-800' :
    cardStyle === 'gray' ? 'bg-gray-100 dark:bg-gray-700' :
    cardStyle === 'dark' ? 'bg-gray-800' :
    'border border-gray-300 dark:border-gray-600'
  }`}
  style={{ width: maxWidth, maxWidth }}
>
  <div className="card-body">
    <div className="flex justify-between">
      <div>
        <h6 className="card-title font-bold dark:text-white">{notification.message}</h6>
        <small className="text-muted dark:text-gray-300">
          {formatDate(notification.timestamp)}
        </small>
      </div>
      <span className="text-primary">🔔</span>
    </div>
  </div>
</div>

// After
<Card
  key={notification.id}
  mb="sm"
  maw={maxWidth}
  mx="auto"
  variant={cardStyle === 'bordered' ? 'outline' : 'filled'}
  bg={
    cardStyle === 'white' ? 'white' :
    cardStyle === 'gray' ? 'gray.1' :
    cardStyle === 'dark' ? 'dark.7' :
    undefined
  }
>
  <Group justify="space-between">
    <div>
      <Text fw={700} size="sm">{notification.message}</Text>
      <Text size="xs" c="dimmed">
        {formatDate(notification.timestamp)}
      </Text>
    </div>
    <Text c="blue" size="lg">🔔</Text>
  </Group>
</Card>
```

### Success Criteria:

#### Automated Verification:
- [ ] Component renders notifications correctly: `npm run build`
- [ ] TypeScript validation passes: `npm run typecheck`
- [ ] No console errors in development: `npm run dev`

#### Manual Verification:
- [ ] Notification cards display with correct styling variants
- [ ] Clear All button works and shows proper disabled state
- [ ] Layout responsive and matches original design
- [ ] Dark mode works for all card variants

## Phase 4: App Component and Final Cleanup

### Overview
Migrate remaining App component button and remove all Tailwind dependencies.

### Changes Required:

#### 1. App Edit Button Migration
**File**: `notifyhub/frontend/src/App.jsx`
**Changes**: Replace Tailwind button with Mantine Button

```jsx
// Before
import { useState, useEffect, useRef } from 'react';
import { Puck, Render } from "@measured/puck";
import { config } from './puck-config.jsx';

function App() {
  // ... existing code ...

  return (
    <>
      <div className="fixed top-4 right-4 z-50">
        <button
          onClick={() => setIsEditing(!isEditing)}
          className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded"
        >
          {isEditing ? 'View Live' : 'Edit Layout'}
        </button>
      </div>

// After
import { useState, useEffect, useRef } from 'react';
import { Puck, Render } from "@measured/puck";
import { config } from './puck-config.jsx';
import { Button } from '@mantine/core';

function App() {
  // ... existing code ...

  return (
    <>
      <Button
        onClick={() => setIsEditing(!isEditing)}
        style={{ position: 'fixed', top: 16, right: 16, zIndex: 50 }}
      >
        {isEditing ? 'View Live' : 'Edit Layout'}
      </Button>
```

#### 2. Remove Tailwind from CSS
**File**: `notifyhub/frontend/src/index.css`
**Changes**: Remove Tailwind imports and custom styles

```css
/* Remove these lines: */
/* @import "@measured/puck/puck.css"; */
/* @tailwind base; */
/* @tailwind components; */
/* @tailwind utilities; */
/* body { */
/*   @apply bg-gray-100 text-black dark:bg-gray-900 dark:text-white; */
/* } */
/* html.dark body { */
/*   background-color: #111 !important; */
/*   color: white !important; */
/* } */

/* Replace with Mantine global styles */
@import '@mantine/core/styles/global.css';
@import '@mantine/core/styles/baseline.css';
@import '@mantine/core/styles/default-css-variables.css';

body {
  background-color: light-dark(var(--mantine-color-gray-0), var(--mantine-color-dark-9));
  color: light-dark(var(--mantine-color-black), var(--mantine-color-white));
}
```

#### 3. Remove Tailwind Dependencies
**File**: `notifyhub/frontend/package.json`
**Changes**: Remove TailwindCSS package

```json
{
  "devDependencies": {
    "tailwindcss": null
  }
}
```

#### 4. Delete Tailwind Config Files
**File**: `notifyhub/frontend/tailwind.config.js` (delete)
**File**: `notifyhub/frontend/postcss.config.js`
**Changes**: Remove Tailwind from PostCSS config

```js
export default {
  plugins: {
    autoprefixer: {},
  },
}
```

### Success Criteria:

#### Automated Verification:
- [ ] No TailwindCSS in dependencies: `npm list | grep tailwind`
- [ ] Build succeeds without Tailwind: `npm run build`
- [ ] Bundle size reduced: `npm run build && ls -lh dist/`
- [ ] All tests pass: `npm test`

#### Manual Verification:
- [ ] Edit button functions correctly in both modes
- [ ] All UI components work in light and dark themes
- [ ] No visual regressions compared to original design
- [ ] Performance improved (check Lighthouse scores)

## Testing Strategy

### Unit Tests:
- Component rendering tests for all migrated components
- Theme application verification
- Dark mode toggle functionality

### Integration Tests:
- End-to-end notification flow
- Edit mode switching
- Responsive layout behavior

### Manual Testing Steps:
1. Load application and verify all components render
2. Toggle dark mode and check theme consistency
3. Test notification creation and display
4. Verify edit mode functionality
5. Check responsive behavior on different screen sizes
6. Test audio and connection status alerts

## Performance Considerations

- Mantine components are optimized and tree-shakable
- Expected bundle size reduction of ~30% from removing TailwindCSS
- Improved runtime performance with fewer CSS calculations
- Better accessibility with Mantine's built-in ARIA support

## Migration Notes

- Mantine's color scheme detection uses `prefers-color-scheme` media query
- Component props are more semantic than Tailwind classes (size="sm" vs "text-sm")
- Mantine provides better TypeScript support with typed component props
- Existing Puck configuration remains compatible

## References

- Mantine Documentation: https://mantine.dev/
- Migration from Tailwind conflicts: https://mantine.dev/guides/tailwind/
- NotifyHub Issue: `docs/issues/2025-12-29-migrate-from-tailwindcss-to-mantine.md`
- Current Implementation: `notifyhub/frontend/src/puck-config.jsx:24-136`
- Current App Component: `notifyhub/frontend/src/App.jsx:173-180`