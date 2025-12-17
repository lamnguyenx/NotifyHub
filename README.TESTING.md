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
# Run all UI tests (connects to manual Chrome if WEBSOCKET_ENDPOINT set)
npm run test:ui

# Debug mode (headed, no timeout - launches new Chrome)
npm run test:ui:debug

# Run with Makefile
make test-ui
```

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
curl http://localhost:9222/json && WEBSOCKET_ENDPOINT="$(curl -s http://localhost:9222/json | jq -r '.[0].webSocketDebuggerUrl')" npm run test:ui
```

**Example:**
```bash
# If curl shows: "webSocketDebuggerUrl": "ws://localhost:9222/devtools/page/ABC123..."
WEBSOCKET_ENDPOINT="ws://localhost:9222/devtools/page/ABC123..." npm run test:ui
```

**Note**: Debug mode (`npm run test:ui:debug`) always launches a new Chrome instance. For debugging with your manual Chrome, run in normal mode and use Chrome DevTools to inspect the connected browser.

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
   This verifies Chrome remote debugging is working properly.

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
WEBSOCKET_ENDPOINT="ws://localhost:9222/devtools/page/YOUR_TARGET_ID" npm run test:ui
```

## Test Organization
- `tests/ui/pages/` - Page Object Model classes
- `tests/ui/specs/` - Test specifications
- `tests/ui/fixtures/` - Test data
- `tests/ui/utils/` - Helper utilities