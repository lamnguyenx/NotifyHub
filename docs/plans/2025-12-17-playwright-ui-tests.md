# Playwright Web UI Tests Implementation Plan

## Implementation Status: ✅ COMPLETED

This plan was successfully implemented using **TypeScript** instead of JavaScript for better type safety and maintainability. All test files, page objects, and configurations have been created with full TypeScript support.

**IMPORTANT LESSON**: This implementation initially assumed data-testid attributes existed without researching the actual codebase first. Future implementation plans should emphasize codebase research before writing code, using requirements/pseudo-code rather than concrete implementations for complex selectors.

## Overview

Implement automated web UI tests using Playwright with Chrome remote debugging support to ensure NotifyHub's React interface reliability and catch regressions early. Focus on notification display, user interactions, and error handling scenarios.

## Current State Analysis

NotifyHub has a React/Vite web UI with:
- Real-time SSE notifications with audio playback (`web/src/App.jsx`)
- Puck-based customizable layouts for dashboard components
- Key components: NotificationList (display/clear), ConnectionStatus (error handling), Header
- Simple user interactions: edit mode toggle, clear all notifications button
- No existing UI tests; backend testing uses pytest in `tests/` directory
- Web package lacks testing infrastructure

## Desired End State

After implementation:
- Playwright v1.40+ configured with Chrome remote debugging
- Test suite covering notification workflows and UI interactions
- Page Object Model organizing test code for maintainability
- 70% UI component coverage with <10 minute execution
- Integration with existing pytest test infrastructure
- Support for both local debugging and remote Chrome connections

### Key Deliverables:
- Playwright configuration files in root directory with TypeScript support
- TypeScript Page Object classes for UI components
- Component and E2E test suites in TypeScript in `tests/` directory
- Updated package.json with test scripts and TypeScript dependencies

## What We're NOT Doing

- Full component testing with @playwright/experimental-ct-react (keeping it simple for now)
- Cross-browser testing beyond Chrome (focus on primary browser)
- Performance/load testing (separate concern)
- Visual regression testing (out of scope)
- Migration of existing backend tests to Playwright

## Implementation Approach

**CRITICAL**: Before writing any test code, thoroughly research the existing web UI codebase to understand the actual DOM structure, selectors, and component implementations. Do not assume data-testid attributes or selectors exist - verify them by examining the source code first.

Use Chrome remote debugging for flexible development and testing:
- Support local auto-launched Chrome with debugging port
- Allow connection to remote Chrome instances via port forwarding
- Page Object Model for test organization and maintainability
- Incremental test development with debugging capabilities
- Integration with existing test directory structure

### Codebase Research Requirements

Before implementing tests, examine:
- Web UI components (`web/src/`) to understand DOM structure and CSS classes
- Existing HTML elements and their selectors
- Component state and user interactions
- Text content and dynamic elements
- **DO NOT assume data-testid attributes exist unless verified in code**
- **Use actual CSS classes, text content, or element relationships for selectors**

## Phase 1: Chrome Debugging Configuration

### Overview
Setup Playwright configuration to support Chrome remote debugging for both local development and remote browser connections.

### Changes Required:

#### 1. TypeScript and Playwright Installation
**File**: `package.json`
**Changes**: Add TypeScript and Playwright dependencies

```json
{
  "devDependencies": {
    "@types/node": "^25.0.2",
    "@playwright/test": "^1.40.0",
    "typescript": "^5.0.0"
  },
  "scripts": {
    "test:ui": "playwright test",
    "test:ui:debug": "playwright test --headed --timeout=0",
    "test:all": "npm run test && npm run test:ui"
  }
}
```

#### 2. TypeScript Configuration
**File**: `tests/ui/tsconfig.json`
**Changes**: TypeScript configuration for test files

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "node",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "allowSyntheticDefaultImports": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "types": ["@playwright/test"]
  },
  "include": [
    "**/*.ts"
  ],
  "exclude": [
    "node_modules"
  ]
}
```

#### 3. Playwright Configuration File
**File**: `playwright.config.js`
**Changes**: New configuration supporting remote debugging

```javascript
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'tests/ui',
  timeout: 30000,
  expect: {
    timeout: 5000,
  },
  use: {
    headless: true,
    baseURL: 'http://localhost:5173',
    // Remote debugging configuration
    launchOptions: {
      args: [
        '--remote-debugging-port=9222',
        '--remote-debugging-address=0.0.0.0',
      ],
    },
  },
  webServer: {
    command: 'cd web && npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: true,
  },
});
```

### Success Criteria:

#### Automated Verification:
- [ ] TypeScript and Playwright install successfully: `npm install`
- [ ] Playwright browsers install: `npx playwright install`
- [ ] Configuration loads without errors: `npx playwright test --list`
- [ ] Chrome launches with debugging port: `timeout 10 npm run test:ui:debug || true`

#### Manual Verification:
- [ ] Chrome DevTools can connect to localhost:9222 when tests run
- [ ] Web UI loads correctly in debugging Chrome instance
- [ ] No console errors in browser during test execution

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that Chrome debugging is working correctly before proceeding to the next phase.

---

## Phase 2: Basic Test Infrastructure

### Overview
Create foundational test structure with Page Object Model setup and basic test connectivity.

### Changes Required:

#### 1. Test Directory Structure
**File**: `tests/ui/` (new directory)
**Changes**: Create organized test directory structure

```
tests/ui/
├── pages/          # Page Object classes
├── specs/          # Test specifications
├── fixtures/       # Test data and setup
└── utils/          # Test utilities
```

#### 2. Base Page Object Class
**File**: `tests/ui/pages/BasePage.ts`
**Requirements**: Create reusable base class for all page objects with TypeScript types
- Import Page type from Playwright
- Implement constructor with Page parameter
- Add common navigation methods (goto, waitForLoad)
- Use protected access modifier for page property

#### 3. App Page Object
**File**: `tests/ui/pages/AppPage.ts`
**Requirements**: Page object for main application interactions
- **RESEARCH REQUIRED**: Examine `web/src/App.jsx` to find actual edit toggle button selector
- **RESEARCH REQUIRED**: Examine connection status component in puck-config.jsx
- Implement methods for:
  - Toggling edit mode (find actual button using text/CSS classes)
  - Checking edit state (may need to use text content or CSS classes)
  - Expecting connection errors (use actual CSS classes like '.alert.alert-warning')

### Success Criteria:

#### Automated Verification:
- [ ] Test directory structure exists: `ls -la tests/ui/`
- [ ] TypeScript configuration works: `npx playwright test --list`
- [ ] Page Object classes compile without errors: `npx tsc --noEmit --project tests/ui/tsconfig.json`

#### Manual Verification:
- [ ] Chrome debugging shows test navigation to web UI
- [ ] Page Object methods execute expected browser interactions
- [ ] No JavaScript errors in console during test execution

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that basic test infrastructure is working before proceeding to the next phase.

---

## Phase 3: Notification Test Development

### Overview
Implement tests for core notification functionality using debugging capabilities for development and recording.

### Changes Required:

#### 1. Notification Page Object
**File**: `tests/ui/pages/NotificationPage.ts`
**Requirements**: Complete page object for notification interactions
- **RESEARCH REQUIRED**: Examine `web/src/puck-config.jsx` NotificationList component to find:
  - Actual CSS classes for notification cards (likely '.card.mb-2' or similar)
  - Clear all button selector (likely '.btn.btn-outline-danger.btn-sm' with text "Clear All")
  - How to count notifications (use locator.count() on notification container)
- Implement methods for notification management using discovered selectors

#### 2. Basic Notification Tests
**File**: `tests/ui/specs/notification.spec.ts`
**Requirements**: Core notification test scenarios
- Import proper TypeScript types from Playwright
- Create page object instances in beforeEach hook
- Test scenarios should cover:
  - Displaying existing notifications (verify count >= 0)
  - Clearing all notifications (click clear button, verify no notifications remain)
  - Edit mode toggle (click edit button, verify state change using actual DOM indicators)

### Success Criteria:

#### Automated Verification:
- [ ] Notification tests pass: `npm run test:ui -- --grep "notification"`
- [ ] Page Object methods work correctly: `npm run test:ui -- --grep "edit mode"`
- [ ] Test execution completes under 2 minutes: `time npm run test:ui`

#### Manual Verification:
- [ ] Chrome debugging shows notification interactions during test execution
- [ ] Clear all button functionality verified in debugging browser
- [ ] Edit mode toggle works correctly during test runs
- [ ] No race conditions with SSE notification updates

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that notification tests are working correctly before proceeding to the next phase.

---

## Phase 4: Test Suite Integration

### Overview
Integrate UI tests with existing test infrastructure.

### Changes Required:

#### 1. Root Package.json Test Scripts
**File**: `package.json`
**Changes**: Add UI test commands to root package (already updated with TypeScript dependencies)

#### 2. Makefile Integration
**File**: `Makefile`
**Changes**: Add UI testing targets

```makefile
.PHONY: test-ui test-ui-debug test-all

test-ui:
	npm run test:ui

test-ui-debug:
	npm run test:ui:debug

test-all: test test-ui
```

### Success Criteria:

#### Automated Verification:
- [ ] Root test commands work: `npm run test:ui`
- [ ] Makefile targets execute: `make test-ui`
- [ ] All tests run together: `npm run test:all`

#### Manual Verification:
- [ ] UI tests run alongside backend tests: `npm run test:all`
- [ ] Debugging mode works in development environment
- [ ] Test execution time stays under 10 minutes

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that test integration is working correctly before proceeding to the next phase.

---

## Phase 5: Documentation and Finalization

### Overview
Add documentation, README updates, and final cleanup for production readiness.

### Changes Required:

#### 1. UI Testing Documentation
**File**: `docs/testing/ui-testing.md`
**Changes**: Comprehensive testing documentation

```markdown
# Web UI Testing with Playwright

## Overview
Automated testing for NotifyHub's web interface using Playwright with Chrome remote debugging.

## Setup
```bash
npm install
npx playwright install
```

## Running Tests
```bash
# Run all UI tests
npm run test:ui

# Debug mode (headed, no timeout)
npm run test:ui:debug

# Run with Makefile
make test-ui
```

## Chrome Remote Debugging
Tests support connecting to Chrome instances with remote debugging:

### Local Development
Tests automatically launch Chrome with debugging on port 9222.

### Remote Chrome
Connect to Chrome running elsewhere:
```bash
# On remote machine
google-chrome --remote-debugging-port=9222 --remote-debugging-address=0.0.0.0

# Local port forwarding
ssh -L 9222:localhost:9222 remote-machine

# Run tests against remote Chrome
WEBSOCKET_ENDPOINT=ws://localhost:9222/devtools/browser PLAYWRIGHT_CHROMIUM_ARGS="--remote-debugging-port=9222" npm run test:ui
```

## Test Organization
- `tests/ui/pages/` - Page Object Model classes
- `tests/ui/specs/` - Test specifications
- `tests/ui/fixtures/` - Test data
- `tests/ui/utils/` - Helper utilities
```

#### 2. README Updates
**File**: `README.md`
**Changes**: Add UI testing section

```markdown
## Testing

### Backend Tests
```bash
make test
```

### UI Tests
```bash
# Install dependencies
npm install
cd web && npx playwright install

# Run UI tests
npm run test:ui

# Debug mode
npm run test:ui:debug
```

### All Tests
```bash
make test-all
```
```

### Success Criteria:

#### Automated Verification:
- [ ] Documentation builds without errors: `cat docs/testing/ui-testing.md`
- [ ] README renders correctly: `head -50 README.md`
- [ ] All test commands documented and functional

#### Manual Verification:
- [ ] Documentation is clear and complete for new developers
- [ ] Remote debugging instructions work as described
- [ ] README provides sufficient setup guidance
- [ ] No broken links or outdated information

## Testing Strategy

### Unit Tests:
- Page Object method validation
- Locator accuracy testing
- Individual component behavior

### Integration Tests:
- End-to-end notification workflows
- UI state management

### Manual Testing Steps:
1. Run tests in debug mode and verify Chrome interactions
2. Test remote debugging with port forwarding
3. Confirm notification display and clearing functionality

## Performance Considerations

- Test execution time target: <10 minutes
- Parallel test execution where possible
- Minimal browser startup overhead with remote debugging
- Reuse existing server instances in development

## Migration Notes

- UI tests are additive to existing backend tests
- No changes required to backend testing infrastructure
- Web UI remains unchanged for production use

## Lessons Learned

### What Went Well
- TypeScript implementation with proper type safety
- Chrome remote debugging configuration working
- Page Object Model structure established
- Integration with existing test infrastructure

### What Could Be Improved
- **Codebase Research**: Always examine actual UI components before writing selectors
- **Selector Strategy**: Use actual CSS classes and text content instead of assuming data-testid attributes
- **Implementation Approach**: Write requirements and pseudo-code for complex implementations, not concrete code
- **Validation**: Test selectors against actual running application before finalizing

### Future Plan Guidelines
For complex implementations:
1. **Research First**: Examine source code to understand DOM structure
2. **Requirements Over Code**: Write what needs to be done, not how exactly
3. **Pseudo-code**: Use pseudo-code for complex logic
4. **Selector Discovery**: Document how to find actual selectors in the codebase
5. **Validation Steps**: Include steps to verify selectors work against running app

## References

- Issue requirements: `docs/issues/2025-12-17-automate-web-ui-tests-with-playwright.md`
- Web UI components: `web/src/App.jsx`, `web/src/puck-config.jsx`
- UI test implementation: `tests/ui/` (TypeScript)
- Existing test patterns: `tests/test_*.py`</content>
<parameter name="filePath">docs/plans/2025-12-17-playwright-ui-tests.md