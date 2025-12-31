# Notification Fan-In Compression Not Triggered on New Notification Arrival

## Issue Summary
When new notifications arrive and push existing notifications into the bottom 15% viewport region, the fan-in compression effect (scaling down and opacity fade) is not applied until the user manually scrolls, breaking the Apple-like stacking animation behavior.

## Description
The notification cards implement a "fan-in" compression effect where notifications in the bottom 15% of the viewport are progressively scaled down to 85% and faded to 30% opacity to create depth and prevent visual clutter. However, this effect only triggers on `scroll` and `resize` events, not when the notification list changes due to new arrivals.

## Steps to Reproduce
1. Start the NotifyHub frontend and backend servers
2. Add enough notifications to fill the viewport so some are near the bottom
3. Add a new notification (without scrolling)
4. Observe that notifications pushed into the bottom region don't compress immediately
5. Scroll slightly - compression effect now applies

## Expected Behavior
When new notifications arrive, any existing notifications that get pushed into the bottom 15% viewport region should immediately scale down and fade according to the compression algorithm, creating smooth stacking animation.

## Actual Behavior
Notifications pushed into the bottom region by new arrivals remain at full size and opacity until the user scrolls, then suddenly snap to compressed state.

## Root Cause
The `useEffect` in `NotificationCard.tsx` that calculates compression state only listens to `scroll` and `resize` events:

```typescript
useEffect(() => {
  // ... compression calculation
  window.addEventListener('scroll', updateCompression);
  window.addEventListener('resize', updateCompression);
}, []); // Empty dependency array
```

When new notifications arrive and change each card's `index` and the `total` count, the compression isn't recalculated.

## Solution
Add `index` and `total` to the useEffect dependency array so compression recalculates when notification positions change:

```typescript
}, [index, total]); // Recalculate when notification position changes
```

## Impact
- Breaks the seamless Apple-like notification stacking experience
- Creates jarring visual transitions when users scroll after new notifications arrive
- Inconsistent animation behavior compared to native iOS notification center

## Testing
- Add multiple notifications to fill viewport
- Add new notification without scrolling
- Verify compression applies immediately to affected notifications
- Confirm existing tests pass

## Related Files
- `notifyhub/frontend/src/components/NotificationCard.tsx`
- `docs/refs/apple_notification_animation_behavior.md`</content>
<parameter name="filePath">docs/issues/2025-12-31-notification-fan-in-compression-bug.md