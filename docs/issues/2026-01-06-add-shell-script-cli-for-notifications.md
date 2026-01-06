---
title: Add Shell Script CLI for Notifications
labels: feature-request, cli
priority: medium
---

# Add Shell Script CLI for Notifications

## Feature Request

### Overview
Add a curl-based shell script CLI (`notifyhub-push.sh`) that sends notifications to the NotifyHub backend, using environment variables for host and port configuration and relying on backend validation.

### Background
The existing `cli.py` provides notification sending with client-side validation, but requires Python and dependencies. A simpler shell script would allow usage in environments without Python, while keeping the full-featured CLI intact.

### User Story
- **As a** developer or user
- **I want to** send notifications via a simple shell script
- **So that** I can do so in lightweight environments without Python dependencies

### Requirements
- Shell script `notifyhub-push.sh` in `src/notifyhub/`
- Environment variable support for `$host` and `$port` with fallbacks
- Data wrapping matching `cli.py` format
- Backend update for structured error responses

### Acceptance Criteria
- [ ] `notifyhub-push.sh` script created at `src/notifyhub/notifyhub-push.sh`
- [ ] Script reads `$host` (default `localhost`) and `$port` (default `9080`)
- [ ] Accepts notification data as JSON string argument
- [ ] Wraps data as `{"data": <json>}` and POSTs to `http://$host:$port/api/notify`
- [ ] Handles success response with "✓ Notification sent successfully"
- [ ] Handles error response by printing `{"error": <traceback>}` details
- [ ] Exits with status 0 on success, 1 on error
- [ ] Backend `/api/notify` returns `{"error": <python_traceback_str>.split('\n')}` on errors
- [ ] Existing `cli.py` remains unchanged
- [ ] Documentation updated to describe `notifyhub-push.sh` usage

### Technical Notes
- Follow existing `cli.py` structure for data wrapping and endpoint usage
- Backend error format should be a list of strings from traceback split on newlines
- Use standard Bash and curl (no additional dependencies)
- Store script in `src/notifyhub/` alongside `cli.py`

### Proposed Implementation
1. Create `src/notifyhub/notifyhub-push.sh` with env var handling and curl logic
2. Update `backend.py` `/api/notify` endpoint to return structured error JSON
3. Test integration with backend (success and error cases)
4. Update relevant docs (e.g., README or AGENTS.md) with `notifyhub-push.sh` usage

### Alternatives Considered
- **Option A**: Extend `cli.py` with a flag for curl mode – Rejected for adding complexity to Python CLI
- **Option B**: Full replacement of `cli.py` with `notifyhub-push.sh` – Rejected to keep Python validation option
- **Option C**: ‚úÖ Selected for maintaining both CLIs with clear separation

### Estimated Effort
**1-2 days** (0.5 days for script, 0.5 days for backend, 1 day for testing/docs)