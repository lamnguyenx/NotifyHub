# Add Shell Script CLI for Notifications Implementation Plan

## Overview

Add a curl-based shell script CLI (`notifyhub-push.sh`) that sends notifications to the NotifyHub backend without Python dependencies, using environment variables for configuration and relying on backend validation. Update the backend to return structured error responses for better error handling.

## Current State Analysis

The existing `cli.py` provides full-featured notification sending with client-side validation using Pydantic models. The backend `/api/notify` endpoint validates incoming data but does not handle validation errors gracefully - exceptions are raised unhandled.

## Desired End State

Users can send notifications using `./notifyhub-push.sh '{"message": "test notification"}'` in environments without Python. The script handles success/error responses appropriately, and backend provides structured error information when validation fails.

### Key Discoveries:
- `cli.py:19-26`: Client-side JSON parsing and validation using `Notification.model_validate()`
- `cli.py:32-34`: Data wrapped as `{"data": <parsed_data>}` and POSTed to `/api/notify`
- `backend.py:134-139`: Server validates `request.data` with `Notification.model_validate()` but lacks error handling
- `backend.py:139`: Success response format `{"success": True, "id": "<uuid>"}`

## What We're NOT Doing

- Modifying existing `cli.py` functionality or validation behavior
- Adding new validation rules or data formats
- Changing the API endpoint URL or success response format
- Supporting additional CLI features beyond basic notification sending

## Implementation Approach

1. Update backend `/api/notify` to catch validation exceptions and return structured error responses
2. Create `notifyhub-push.sh` script that wraps JSON data and uses curl with environment variable configuration
3. Update documentation to describe `notifyhub-push.sh` usage
4. Test integration between script and updated backend

## Phase 1: Update Backend Error Handling

### Overview
Modify the `/api/notify` endpoint to catch `Notification.model_validate()` exceptions and return structured error responses containing the Python traceback split into a list.

### Changes Required:

#### 1. Backend API Error Handling
**File**: `src/notifyhub/backend/backend.py`
**Changes**: Wrap the validation and processing in try-except block, import traceback module, return structured error response on exceptions.

```python
# Add import traceback

# In @app.post("/api/notify"):
#   try:
#     ... existing validation and processing ...
#   except Exception as e:
#     return {"error": traceback.format_exc().split('\n')}
```

### Success Criteria:

#### Automated Verification:
- [ ] Backend starts without errors: `make backend`
- [ ] Valid notification POST succeeds: `curl -X POST http://localhost:9080/api/notify -H "Content-Type: application/json" -d '{"data": {"message": "test"}}' | jq -e '.success'`
- [ ] Invalid notification POST returns error array: `curl -X POST http://localhost:9080/api/notify -H "Content-Type: application/json" -d '{"data": {"invalid": "field"}}' | jq -e '.error | length > 0'`

#### Manual Verification:
- [ ] Backend logs show no unhandled exceptions during error cases
- [ ] Error response contains readable traceback information

## Phase 2: Create Shell Script CLI

### Overview
Create `notifyhub-push.sh` script in `src/notifyhub/` that constructs notifications with pwd and message from arguments, and POSTs to the API using curl with environment variable configuration.

### Changes Required:

#### 1. Shell Script Implementation
**File**: `src/notifyhub/notifyhub-push.sh`
**Changes**: Create new executable shell script with environment variable handling, curl logic, and response parsing.

```bash
#!/bin/bash

# Set NOTIFYHUB_ADDRESS from environment or default
# Check arguments, exit if none
# Construct JSON: {"pwd": "$PWD", "message": "$*"}
# Create payload: {"data": json_data}
# POST to $NOTIFYHUB_ADDRESS/api/notify
# Handle curl errors
# Parse response for success/error cases
```

### Success Criteria:

#### Automated Verification:
- [ ] Script file exists and is executable: `ls -la src/notifyhub/notifyhub-push.sh` and `test -x src/notifyhub/notifyhub-push.sh`
- [ ] Script shows usage on no args: `./notifyhub-push.sh 2>&1 | grep -q "Usage"`
- [ ] Script accepts message arguments: `echo $?` after `./notifyhub-push.sh 'test message'` (with backend running)

#### Manual Verification:
- [ ] Script uses environment variables correctly
- [ ] Success message displays on valid notification
- [ ] Error details display on invalid data
- [ ] Exit codes are correct (0 for success, 1 for error)

## Phase 3: Update Documentation

### Overview
Add documentation for `notifyhub-push.sh` usage in relevant files (likely AGENTS.md or README.md).

### Changes Required:

#### 1. Documentation Updates
**File**: `AGENTS.md` (or appropriate docs file)
**Changes**: Add section describing `notifyhub-push.sh` usage alongside `cli.py` documentation.

```markdown
## CLI Usage

### Python CLI (cli.py)
For full-featured notification sending with client-side validation:
```bash
python src/notifyhub/cli.py --port 9080 '{"message": "Hello World"}'
```

### Shell Script CLI (notifyhub-push.sh)
For lightweight notification sending without Python dependencies:
```bash
./src/notifyhub/notifyhub-push.sh '{"message": "Hello World"}'
```

Environment variables:
- `NOTIFYHUB_HOST`: Server host (default: localhost)
- `NOTIFYHUB_PORT`: Server port (default: 9080)

Example:
```bash
export NOTIFYHUB_HOST=myhost.com
export NOTIFYHUB_PORT=8080
./src/notifyhub/notifyhub-push.sh '{"message": "Hello from shell!"}'
```
```

### Success Criteria:

#### Automated Verification:
- [ ] Documentation file contains notifyhub-push.sh section: `grep -q "notifyhub-push.sh" AGENTS.md`

#### Manual Verification:
- [ ] Documentation accurately describes script usage and environment variables
- [ ] Examples work as documented

## Phase 4: Integration Testing

### Overview
Test the complete flow: script sends data, backend validates and responds, script handles responses correctly.

### Changes Required:
No code changes - this phase is for verification.

### Success Criteria:

#### Automated Verification:
- [ ] Full success flow: Start backend, send valid notification via script, verify success response and notification appears in UI
- [ ] Full error flow: Send invalid notification via script, verify error details returned and logged
- [ ] Environment variable testing: Test with custom HOST/PORT variables

#### Manual Verification:
- [ ] Script works in clean environment (no Python installed)
- [ ] Error messages are helpful for debugging
- [ ] Performance is acceptable (similar to curl timing)

## Testing Strategy

### Unit Tests:
- Backend error handling tests (extend existing test_server.py)
- Script argument validation tests (basic shell testing)

### Integration Tests:
- End-to-end script to backend communication
- Environment variable configuration testing
- Error response parsing and display

### Manual Testing Steps:
1. Start backend server in one terminal
2. Test valid notification: `./notifyhub-push.sh '{"message": "test"}'` → should succeed
3. Test invalid notification: `./notifyhub-push.sh '{"invalid": "data"}'` → should show validation error
4. Test environment variables: `NOTIFYHUB_PORT=9999 ./notifyhub-push.sh '{"message": "test"}'` → should fail to connect
5. Verify notifications appear in frontend UI after successful sends

## Performance Considerations

- Script uses standard curl with reasonable timeouts (default 10s)
- Minimal JSON processing with jq for validation
- No significant performance impact expected compared to existing CLI

## Migration Notes

- Existing `cli.py` remains unchanged - no migration needed
- Backend changes are backwards compatible (success responses unchanged)
- Error responses now structured instead of unhandled exceptions

## References

- Issue: `docs/issues/2026-01-06-add-shell-script-cli-for-notifications.md`
- Current CLI: `src/notifyhub/cli.py:19-48`
- Current API: `src/notifyhub/backend/backend.py:134-139`</content>
<parameter name="filePath">docs/plans/2026-01-06-add-shell-script-cli-for-notifications.md