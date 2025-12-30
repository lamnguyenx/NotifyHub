# Dynamic Default Avatar Testing Plan

## Overview
This plan outlines how to test the dynamic default avatar feature in the NotificationCard component. The avatar displays initials based on the basename of the pwd field, using a consistent color from a Material Design palette.

## Current Implementation
- Avatar replaces the bell icon (🔔) in `.notification-app-icon`.
- Initials: First letter(s) of pwd basename (e.g., "NotifyHub" → "N"; "Test Project" → "TP").
- Color: Deterministic hash-based color from a fixed palette.

## Testing Strategy
Modify the existing Playwright test suite in `notifyhub/frontend/__tests__/specs/notification.spec.ts` to include pwd fields in mock notifications and add a dedicated test for avatar verification.

### Changes to notification.spec.ts
1. **Update Mock Notification Setup** (in beforeEach):
   - Expand from 4 to 8 notifications with diverse pwd paths.
   - Include single-word, multi-word, numbers, symbols, and edge cases.

   ```typescript
   const mockNotifications = [
     { message: 'Build done', pwd: '/Users/test/NotifyHub' },      // → "N"
     { message: 'Tests pass', pwd: '/tmp/Test Project' },         // → "TP"
     { message: 'Deploy ready', pwd: '/home/user/my-app' },       // → "M"
     { message: 'Lint fixed', pwd: '/projects/Foo Bar Baz' },     // → "FBB"
     { message: 'Code review', pwd: '/workspace/A' },             // → "A" (single letter)
     { message: 'Merge conflict', pwd: '/dev/Project-123' },      // → "P" (with numbers)
     { message: 'Hotfix applied', pwd: '/src/Long Project Name Here' }, // → "LPNH"
     { message: 'Backup created', pwd: '/var/@special#dir!' }     // → "@" (special chars)
   ];
   ```

2. **Add New Test Case**:
   - Verify each notification's avatar shows correct initials and background color.
   - Use helper functions to compute expected values.

   ```typescript
   customTest('dynamic default avatars display correctly', async ({ page }) => {
     const notifications = await page.$$('.notification');
     expect(notifications.length).toBe(8);

     const expectedAvatars = [
       { initials: 'N', pwd: 'NotifyHub' },
       { initials: 'TP', pwd: 'Test Project' },
       { initials: 'M', pwd: 'my-app' },
       { initials: 'FBB', pwd: 'Foo Bar Baz' },
       { initials: 'A', pwd: 'A' },
       { initials: 'P', pwd: 'Project-123' },
       { initials: 'LPNH', pwd: 'Long Project Name Here' },
       { initials: '@', pwd: '@special#dir!' }
     ];

     for (let i = 0; i < notifications.length; i++) {
       const avatar = await notifications[i].$('.notification-app-icon');
       const text = await avatar?.textContent();
       expect(text).toBe(expectedAvatars[i].initials);

       const bgColor = await avatar?.evaluate(el => getComputedStyle(el).backgroundColor);
       const expectedColor = getColorFromName(expectedAvatars[i].pwd);
       expect(bgColor).toBe(expectedColor);
     }
   });

   function getColorFromName(name: string): string {
     const colors = ['#4285F4', '#EA4335', '#FBBC05', '#34A853', '#AB47BC', '#FF7043', '#00ACC1', '#7B1FA2', '#F06292', '#26A69A'];
     const hash = name.split('').reduce((a, b) => ((a << 5) - a) + b.charCodeAt(0), 0) & 0xffffffff;
     return colors[Math.abs(hash) % colors.length];
   }
   ```

3. **Update Suite Metadata**:
   - Change comments to reflect 8 mock notifications.

## Execution Steps
1. Start backend: `make backend`
2. Start frontend dev server: `make frontend-dev`
3. Run tests: `make test-frontend-dev`
4. Verify: Check Playwright output; new test should pass, confirming avatars render correctly.

## Edge Cases Covered
- Single letter initials
- Multi-word names (first letters)
- Names with numbers/symbols
- Long names
- Special characters
- Color consistency via hashing

## Dependencies
- Existing Playwright setup
- Chrome CDP connection
- SSE for real-time updates

## Risks and Mitigations
- Test flakiness: Use timeouts and waits for SSE updates.
- Color computation: Ensure hash function matches component logic.
- DOM selectors: Verify CSS classes match actual rendering.

This plan integrates seamlessly with the current test suite and provides thorough validation of the dynamic avatar feature.