# Notification Message Tag Processing Plan

## Overview
Implement post-processing for `notification.message` in `NotificationCard.tsx` to render tags in the format `[#tag:some_text_here]` as styled spans with class `notification-tagCalled`.

## Current State
- `notification.message` is rendered as a plain string using Mantine's `<Text>` component.
- No existing parsing or tag handling in the codebase (based on initial search).

## Implementation Steps
1. **Create Parsing Function**:
   - Add `parseMessageWithTags` function to `NotificationCard.tsx`.
   - Use regex `/\[#tag:(.*?)\]/g` to split the message and identify tags.
   - Return an array of JSX elements: plain text and `<span className="notification-tagCalled">innerText</span>` for each tag.

2. **Update Component Rendering**:
   - Replace the static `<Text>` for the message with parsed JSX.
   - Ensure the container maintains existing styles (`notification-text2 message`).

3. **Add Styles**:
   - Define CSS for `notification-tagCalled` (e.g., `color: #007bff; font-weight: bold;`) in the appropriate stylesheet (likely `src/notifyhub/frontend/src/components/NotificationCard.css` or global CSS).

4. **Testing**:
   - Test with messages containing 0, 1, or multiple tags.
   - Verify rendering and styling.
   - Run `make test-frontend-hotload` to ensure no regressions.
   - Check for XSS safety (no HTML injection beyond controlled spans).

## Assumptions
- Tag format is strictly `[#tag:some_text_here]` (no variations).
- Inner text is safe (no additional sanitization needed beyond React's handling).
- CSS will be added to make spans visually distinct.

## Risks
- Performance impact if messages are very long (mitigated by simple regex).
- Mantine's `<Text>` may not support JSX children—may need to switch to `<div>` or `<span>` if issues arise.

## Timeline
- Plan writing: Complete.
- Implementation: Follow immediately.