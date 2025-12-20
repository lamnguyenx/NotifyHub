# Web UI Testing with Playwright

## Overview
Automated testing for NotifyHub's web interface using Playwright with Chrome remote debugging.

## Test Organization

```bash
tests/ui/
├── pages/                    # Page Object Model classes (supporting scripts)
│   ├── AppPage.ts            # App-wide interactions (edit mode, connection status)
│   ├── BasePage.ts           # Base class with common page methods
│   └── NotificationPage.ts   # Notification-specific actions and assertions
├── specs/                    # Test specifications (actual test files run by Playwright)
│   └── notification.spec.ts  # Notification management tests
├── utils/                    # Helper utilities
│   └── test_chrome_connection.ts # Chrome remote debugging connection test
└── tsconfig.json             # TypeScript configuration for tests
```

## Setup
```bash
# Install dependencies (root for Playwright, web for dev server)
npm install
cd web && bun install

# Install Playwright browsers
npx playwright install
```

## Running Tests
```bash
# Run all UI tests (connects to manual Chrome via CDP)
npx playwright test
# Or with Makefile
make test-ui

# Debug mode (headed, connects to existing Chrome via CDP)
npx playwright test --headed
# Or with Makefile (connects to Chrome on port 9222)
make test-ui-debug

# Test Chrome connection utility
make test-chrome

# Run all tests (backend + UI)
make test-all
```

## Current Test Configuration

- **Test Runner**: Playwright v1.40+ with TypeScript
- **Browser**: Chrome (local launch or remote debugging via CDP)
- **Test Directory**: `tests/ui/` (configured in `playwright.config.ts`)
- **Base URL**: `http://localhost:9080` (backend server port)
- **Web Server**: Disabled for remote Chrome tests (connect to existing instance)
- **Test Coverage**: Basic navigation and UI interaction tests
- **Page Objects**: Reusable classes for UI interactions (BasePage, AppPage, NotificationPage)

## Chrome Remote Debugging
Tests support connecting to Chrome instances with remote debugging:

### Local Development
Start Chrome manually with remote debugging enabled:

**Linux:**
```bash
google-chrome --remote-debugging-port=9222 --remote-debugging-address=0.0.0.0 --user-data-dir=/tmp/chrome-debug
# Or if google-chrome not found:
chromium --remote-debugging-port=9222 --remote-debugging-address=0.0.0.0 --user-data-dir=/tmp/chrome-debug
```

**macOS:**
```bash
/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome --remote-debugging-port=9222 --remote-debugging-address=0.0.0.0 --remote-debugging-host=0.0.0.0 --user-data-dir=/tmp/chrome-debug
# Or if in PATH:
google-chrome --remote-debugging-port=9222 --remote-debugging-address=0.0.0.0 --remote-debugging-host=0.0.0.0 --user-data-dir=/tmp/chrome-debug
```

✅ **Confirmed working** with NotifyHub UI tests and Playwright automation.

**Windows:**
```bash
"C:\Program Files\Google\Chrome\Application\chrome.exe" --remote-debugging-port=9222 --remote-debugging-address=0.0.0.0 --user-data-dir=C:\tmp\chrome-debug
```

Then run tests against your local Chrome instance:
```bash
curl http://localhost:9222/json/version && CDP_WEBSOCKET_ENDPOINT="$(curl -s http://localhost:9222/json/version | jq -r .webSocketDebuggerUrl)" npm run test:ui
```

**Example:**
```bash
# Get the CDP WebSocket URL
CDP_WEBSOCKET_ENDPOINT="$(curl -s http://localhost:9222/json/version | jq -r .webSocketDebuggerUrl)" make test-ui-debug
```

**Note**: Debug mode connects to an existing Chrome instance with remote debugging enabled on port 9222. Start Chrome manually with `--remote-debugging-port=9222` before running tests.

**Tip**: Use the `run_ui_tests.sh` script for automatic WebSocket URL detection:
```bash
./tests/scripts/run_ui_tests.sh
```

### Troubleshooting Remote Chrome

If remote connection fails:

1. **Verify Chrome is running locally:**
   ```bash
   # Check if Chrome processes exist
   ps aux | grep -i chrome

   # Check if port 9222 is listening
   lsof -i :9222  # macOS/Linux
   netstat -an | grep 9222  # Alternative

   # Test local access
   curl http://localhost:9222/json/version
   ```

2. **Kill existing Chrome instances:**
   ```bash
   killall "Google Chrome"  # macOS
   pkill -f chrome  # Linux
   ```

3. **Ensure the user data directory exists:**
   ```bash
   mkdir -p /tmp/chrome-debug
   ```

4. **Test connection with Chrome:**
   ```bash
   make test-chrome
   ```
   This utility script verifies Chrome remote debugging is working.

5. **Test with different flags if needed:**
   - Try without `--user-data-dir` first
   - Ensure no firewall is blocking port 9222
   - On macOS, you may need to allow incoming connections in System Settings > Security & Privacy

### Remote Chrome
Connect to Chrome running elsewhere:
```bash
# On remote machine
google-chrome --remote-debugging-port=9222 --remote-debugging-address=0.0.0.0

# Local port forwarding
ssh -L 9222:localhost:9222 remote-machine

# Get the WebSocket URL from remote Chrome
curl http://localhost:9222/json

# Run tests against remote Chrome using the webSocketDebuggerUrl
CDP_WEBSOCKET_ENDPOINT="ws://localhost:9222/devtools/browser/YOUR_TARGET_ID" npm run test:ui
```

## Lessons Learned

### Connecting to External Chrome Instances

When connecting Playwright tests to an existing Chrome browser with remote debugging enabled:

- **Incorrect**: Using Playwright's `connectOptions.wsEndpoint` in `playwright.config.ts` - this is designed for browsers launched by Playwright itself, not external Chrome instances. It may appear to connect but fail silently, causing tests to hang.

- **Correct**: Use `chromium.connectOverCDP(wsUrl)` in test fixtures to connect via Chrome DevTools Protocol (CDP). The WebSocket URL from Chrome's `/json/version` endpoint works with CDP.

Example fixture for connecting to existing Chrome:
```typescript
const customTest = test.extend({
  browser: async ({}, use) => {
    const browser = await chromium.connectOverCDP(process.env.CDP_WEBSOCKET_ENDPOINT!);
    await use(browser);
    await browser.close();
  },
  page: async ({ browser }, use) => {
    const page = browser.contexts()[0].pages()[0]; // Use existing page
    await use(page);
  },
});
```

Always verify the WebSocket URL with `curl http://localhost:9222/json/version` and ensure Chrome is running with `--remote-debugging-port=9222`.

