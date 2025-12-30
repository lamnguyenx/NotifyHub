---
title: Add Individual Notification Deletion API
labels: feature-request, backend, api
priority: medium
---

# Add Individual Notification Deletion API

## Feature Request

### Overview
Extend the notification API to support deleting individual notifications by ID, enabling selective cleanup of test fixtures and better resource management.

### Background
The current DELETE `/api/notifications` endpoint only clears all notifications. For testing scenarios (e.g., run.sh fixtures), we need to clean up only specific notifications without affecting pre-existing ones. This requires individual deletion capability.

### User Story
- **As a** developer/tester
- **I want to** delete specific notifications by ID
- **So that** I can clean up test fixtures without removing user data

### Requirements
- Modified DELETE `/api/notifications` endpoint with optional `id` query parameter
- Individual notification deletion in NotificationStore
- SSE broadcast for individual deletions
- Updated run.sh for selective fixture cleanup
- Frontend SSE handling for delete events (optional)

### Acceptance Criteria
- [ ] DELETE `/api/notifications?id=<id>` deletes specific notification
- [ ] DELETE `/api/notifications` (no id) clears all (backward compatible)
- [ ] Returns 404 for non-existent IDs
- [ ] SSE broadcasts "delete" event with ID for individual deletions
- [ ] SSE broadcasts "clear" event for bulk deletions
- [ ] run.sh captures notification IDs on creation
- [ ] run.sh deletes only added fixtures by ID
- [ ] Frontend handles "delete" events to update UI in real-time
- [ ] All existing functionality preserved
- [ ] API responses include appropriate success/error messages

### Technical Notes
- The POST `/api/notify` endpoint already returns `{"success": True, "id": "<notification_id>"}`, so IDs can be captured from creation responses
- Modify `notifyhub/backend/models.py` to add `delete_by_id(id: str)` method
- Update `notifyhub/backend/backend.py` DELETE endpoint to accept optional `id` param
- Follow existing patterns for error handling and SSE broadcasting
- Store notification IDs as strings (UUID format)

### Proposed Implementation
1. Add `delete_by_id` method to NotificationStore
2. Modify DELETE endpoint to check for `id` query parameter
3. Broadcast appropriate SSE events ("delete" or "clear")
4. Update run.sh to capture IDs from POST responses and delete selectively
5. Add "delete" event handling in App.tsx (optional)

### Success Metrics
- Reduce test cleanup time by 50% through selective deletion
- Maintain 100% backward compatibility with existing API
- Enable fixture cleanup without affecting user notifications

### Alternatives Considered
- **Option A**: New endpoint `/api/notifications/{id}` - RESTful but requires additional routing
- **Option B**: Modify existing endpoint with query param ‚úÖ - Simple, backward compatible
- **Option C**: Client-side filtering - Doesn't solve server cleanup needs

### Related Issues
- Related to testing improvements in docs/plans/2025-12-30-dynamic-avatar-testing-plan.md

### Estimated Effort
**2-3 days** (1 day backend changes, 1 day frontend/run.sh updates, 1 day testing)