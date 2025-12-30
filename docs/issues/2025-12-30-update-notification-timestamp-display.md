---
title: Update Notification Card Timestamp Display to Match iOS Logic
labels: enhancement, frontend
priority: medium
---

# Update Notification Card Timestamp Display to Match iOS Logic

## Feature Request

### Overview
Update the time display in notification cards to follow Apple's iOS notification timestamp display logic, providing a more intuitive and consistent user experience.

### Background
Current timestamp display in notification cards uses a standard "time ago" format, but users expect iOS-like behavior based on Apple's design patterns. This change will align with user expectations and improve the app's polish, referencing the established logic in `docs/refs/apple_notification_timestamp_display_logic.md`.

### User Story
- **As a** user viewing notifications
- **I want to** see timestamps that update like iOS notifications
- **So that** I can quickly understand when notifications arrived in a familiar way

### Requirements
- Timestamp formatting logic implementation
- Integration with notification card component
- Support for all time ranges (now, minutes, hours, yesterday, dates)

### Acceptance Criteria
- [ ] Display "now" for notifications less than 60 seconds old
- [ ] Display "Xm ago" for notifications 1-59 minutes old
- [ ] Display "Xh ago" for notifications 1-23 hours old
- [ ] Display "Yesterday" for notifications from the previous calendar day
- [ ] Display full date (MM/DD/YY format) for notifications older than 2 days
- [ ] Timestamps update every minute or on refresh
- [ ] Logic matches exactly the iOS behavior described in the reference document

### Technical Notes
- Implement in the frontend notification card component (`notifyhub/frontend/src/components/NotificationCard.tsx`)
- Create a utility function for timestamp formatting
- Follow existing code patterns and TypeScript conventions
- Use date manipulation libraries already available in the project (check package.json)

### Proposed Implementation
1. Create a timestamp utility function in `notifyhub/frontend/src/utils/timestampUtils.ts`
2. Implement the iOS logic phases (now, minutes, hours, yesterday, date)
3. Update `NotificationCard.tsx` to use the new formatting function
4. Test with various time ranges to ensure accuracy
5. Update any related tests in the frontend test suite

### Success Metrics
- 100% match with iOS timestamp display behavior
- No performance impact on notification rendering
- Positive user feedback on improved timestamp readability

### Alternatives Considered
- **Option A**: Use existing time-ago library - Simple but doesn't match iOS behavior
- **Option B**: Custom implementation with rounding - Less accurate to iOS logic
- **Option C**: ✓ Selected - Exact iOS logic implementation for consistency

### Related Issues
- Related to overall notification UX improvements
- Depends on notification card component stability