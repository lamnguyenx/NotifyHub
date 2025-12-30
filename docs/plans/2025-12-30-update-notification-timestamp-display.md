# Update Notification Card Timestamp Display Implementation Plan

## Overview

Implement iOS-style timestamp display in notification cards to show relative time ("now", "Xm ago", "Xh ago", "Yesterday", or full date) instead of static HH:MM format, with updates every minute or on refresh.

## Current State Analysis

Currently, notifications display timestamps using a simple `toLocaleTimeString()` format showing only hours and minutes (HH:MM). The timestamp is stored as an ISO string from the backend and doesn't update dynamically.

Key files identified:
- `notifyhub/frontend/src/components/NotificationCard.tsx`: Main component displaying notifications
- `notifyhub/frontend/src/models/NotificationData.ts`: Data model (no timestamp logic)
- Backend timestamp: `datetime.now().isoformat()` in `notifyhub/backend/models.py`

No existing timestamp utilities or relative time formatting.

## Desired End State

Notification cards display timestamps following iOS logic:
- < 60s: "now"
- 1-59m: "Xm ago" 
- 1-23h: "Xh ago"
- Previous calendar day: "Yesterday"
- > 2 days: "MM/DD/YY"

Timestamps update every minute automatically, with no performance impact on rendering.

### Key Discoveries:
- Current formatTime function: `new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })` in `NotificationCard.tsx:17-19`
- Timestamp format: ISO string from backend
- No existing utils directory
- @mantine/dates available but not used for timestamps

## What We're NOT Doing

- Changing backend timestamp format or storage
- Adding real-time updates (every second) to avoid CPU consumption
- Modifying notification data structure
- Implementing timezone handling (assuming UTC/local consistency)

## Implementation Approach

Create a custom timestamp utility implementing exact iOS logic, integrate it into the notification card with periodic updates using React hooks.

## Phase 1: Create Timestamp Utility

### Overview
Implement the iOS timestamp formatting logic in a new utility file.

### Changes Required:

#### 1. Create Timestamp Utils File
**File**: `notifyhub/frontend/src/utils/timestampUtils.ts`
**Changes**: New file with iOS timestamp formatting function

**Pseudo-code logic:**
```
function formatTimestamp(timestamp_string):
  current_time = get_current_datetime()
  notification_time = parse_datetime(timestamp_string)
  time_difference_ms = current_time - notification_time
  
  if time_difference_ms < 60_seconds:
    return "now"
  
  minutes_elapsed = floor(time_difference_ms / (60 * 1000))
  if minutes_elapsed < 60:
    return "{minutes_elapsed}m ago"
  
  hours_elapsed = floor(time_difference_ms / (60 * 60 * 1000))
  if hours_elapsed < 24:
    return "{hours_elapsed}h ago"
  
  # Check if notification is from previous calendar day
  previous_day = current_time - 1_day
  if notification_time.date == previous_day.date:
    return "Yesterday"
  
  # For notifications older than 2 days
  days_elapsed = floor(time_difference_ms / (24 * 60 * 60 * 1000))
  if days_elapsed > 1:
    return format_date(notification_time, "MM/DD/YY")
  
  return "Yesterday"  # fallback
```

### Success Criteria:

#### Automated Verification:
- [ ] File exists: `notifyhub/frontend/src/utils/timestampUtils.ts`
- [ ] TypeScript compilation passes: `npm run build`
- [ ] Function exports correctly

#### Manual Verification:
- [ ] Function returns correct formats for various time ranges
- [ ] Logic matches iOS behavior from reference document

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 2: Update Notification Card Component

### Overview
Replace the static time display with the new formatting function and add periodic updates.

### Changes Required:

#### 1. Update NotificationCard Component
**File**: `notifyhub/frontend/src/components/NotificationCard.tsx`
**Changes**: Import utility, replace formatTime function, add useEffect for updates

**Pseudo-code structure:**
```
import timestamp utility

Component NotificationCard(notification):
  state current_time = initial datetime
  
  effect on mount:
    set interval to update current_time every 60_seconds
    cleanup: clear interval on unmount
  
  # Remove existing formatTime function that returns HH:MM
  
  # ... keep existing avatar and text logic ...
  
  render:
    # Replace static time display with:
    timestamp_display = formatTimestamp(notification.timestamp)
    render timestamp_display in time text element
```

### Success Criteria:

#### Automated Verification:
- [ ] TypeScript compilation passes: `npm run build`
- [ ] Component imports without errors

#### Manual Verification:
- [ ] Timestamps display in iOS format
- [ ] Updates every minute without page refresh
- [ ] No console errors or performance issues

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 3: Add Tests

### Overview
Create unit tests for the timestamp utility and update component tests.

### Changes Required:

#### 1. Add Timestamp Utils Tests
**File**: `notifyhub/frontend/src/utils/timestampUtils.test.ts`
**Changes**: Unit tests for various time ranges

**Test cases to implement:**
- Test "now" for timestamps < 60 seconds old
- Test "Xm ago" format for 1-59 minutes
- Test "Xh ago" format for 1-23 hours
- Test "Yesterday" for previous calendar day
- Test "MM/DD/YY" for > 2 days old
- Test edge cases (exactly 60s, midnight transitions)

**Testing approach:**
- Mock current time for consistent tests
- Test each time range boundary
- Verify exact string outputs match iOS specification

#### 2. Update Component Tests
**File**: `notifyhub/frontend/__tests__/NotificationCard.test.tsx`
**Changes**: Mock the utility and test timestamp display

**Test scenarios:**
- Component renders with formatted timestamp
- Timestamp updates after interval (mock timers)
- Utility function is called with correct timestamp parameter

### Success Criteria:

#### Automated Verification:
- [ ] Tests pass: `npm test`
- [ ] Code coverage maintained

#### Manual Verification:
- [ ] Test edge cases manually if needed

---

## Testing Strategy

### Unit Tests:
- Timestamp utility for all time ranges (<60s, minutes, hours, yesterday, dates)
- Edge cases (exactly 60s, 60m, midnight transitions)

### Integration Tests:
- Notification card renders with correct timestamp format
- Timestamp updates every minute in running app

### Manual Testing Steps:
1. Create notifications at different times (now, 5m ago, 2h ago, yesterday, 3 days ago)
2. Verify correct display format for each
3. Wait for minute update and confirm timestamps refresh
4. Test with page refresh

## Performance Considerations

- Updates every 60 seconds instead of real-time to minimize CPU usage
- Simple date calculations without heavy libraries
- No impact on initial render performance

## Migration Notes

No data migration needed - only display logic changes. Existing notifications will automatically show new format on next render.

## References

- iOS logic reference: `docs/refs/apple_notification_timestamp_display_logic.md`
- GitHub issue: https://github.com/lamnguyenx/NotifyHub/issues/2