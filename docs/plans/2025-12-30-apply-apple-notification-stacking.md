# Apply Apple-Style Notification Stacking Animation Implementation Plan

## Overview

Implement Apple iOS-style notification stacking animations in NotifyHub's web UI, where new notifications appear at the top with fluid spring animations and existing notifications smoothly push down with visual depth effects.

## Current State Analysis

**Current Implementation:**
- Notifications are displayed as a simple mapped list without animations
- New notifications are prepended to the array: `return [notification, ...prev];` (App.tsx:109)
- No animation libraries currently installed
- Static rendering with basic CSS styling

**Key Files to Modify:**
- `notifyhub/frontend/package.json` - Add Framer Motion dependency
- `notifyhub/frontend/src/App.tsx` - Wrap notification list with animation components
- `notifyhub/frontend/src/notification.css` - Add depth and shadow styles
- `notifyhub/frontend/src/components/NotificationCard.tsx` - Apply individual card animations

## Desired End State

After implementation:
- New notifications appear at the top with smooth insertion animation
- Existing notifications animate downward as a group with spring physics
- Visual depth applied: 20% opacity reduction and 5% scaling for older notifications
- Subtle drop shadows for layering effect
- Animations complete within 500ms for perceived responsiveness
- Smooth performance maintained with 50+ notifications

### Key Discoveries:
- Current notification insertion happens immediately without transitions
- No existing animation patterns in the codebase
- Mantine UI integration requires careful animation library selection
- Performance critical for real-time notification streams

## What We're NOT Doing

- Not implementing complex 3D transforms (too performance-heavy)
- Not adding custom animation timing curves beyond spring physics
- Not modifying notification data structure or backend logic
- Not implementing gesture-based interactions
- Not adding sound animation synchronization

## Implementation Approach

**Animation Strategy:**
1. Use Framer Motion for layout animations and spring physics
2. Implement AnimatePresence for enter/exit animations
3. Use layout prop for automatic list reordering animations
4. Apply staggered animations for the push-down effect
5. Add visual depth effects based on notification index/age

**Performance Optimizations:**
- Leverage Framer Motion's GPU acceleration
- Use `will-change` CSS property for optimization
- Implement proper key management for React reconciliation
- Test with 50+ notifications to ensure smooth performance

## Phase 1: Setup and Dependencies

### Overview
Install Framer Motion and prepare the animation foundation.

### Changes Required:

#### 1. Add Framer Motion dependency
**File**: `notifyhub/frontend/package.json`
**Changes**: Add Framer Motion to dependencies

```json
{
  "dependencies": {
    "framer-motion": "^11.0.0",
    // ... existing dependencies
  }
}
```

### Success Criteria:

#### Automated Verification:
- [ ] `npm install` completes successfully
- [ ] Framer Motion appears in package-lock.json
- [ ] TypeScript compilation passes: `npm run build`
- [ ] No dependency conflicts detected

#### Manual Verification:
- [ ] Import statement works: `import { motion } from 'framer-motion'`

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the dependency installation was successful before proceeding to the next phase.

---

## Phase 2: Basic Animation Wrapper

### Overview
Wrap the notification list with AnimatePresence and motion components to enable layout animations.

### Changes Required:

#### 1. Update App.tsx imports
**File**: `notifyhub/frontend/src/App.tsx`
**Changes**: Add Framer Motion imports

```typescript
import { motion, AnimatePresence } from 'framer-motion';
import NotificationCard from './components/NotificationCard';
// ... existing imports
```

#### 2. Wrap notification list with animation components
**File**: `notifyhub/frontend/src/App.tsx`
**Changes**: Replace static list with animated container

```tsx
{/* Notifications */}
<AnimatePresence mode="popLayout">
  <motion.div layout>
    {notifications.map(notification => (
      <NotificationCard key={notification.id} notification={notification} />
    ))}
  </motion.div>
</AnimatePresence>
```

### Success Criteria:

#### Automated Verification:
- [ ] TypeScript compilation passes: `npm run build`
- [ ] Frontend dev server starts: `npm run dev`
- [ ] No console errors in browser

#### Manual Verification:
- [ ] Notifications still display correctly
- [ ] Basic layout animations work (slight movement when adding notifications)

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the basic animation wrapper works correctly before proceeding to the next phase.

---

## Phase 3: Spring Animation and Stacking Effect

### Overview
Implement spring-based animations for the stacking effect where new notifications push older ones down.

### Changes Required:

#### 1. Add layout animations to notification cards
**File**: `notifyhub/frontend/src/components/NotificationCard.tsx`
**Changes**: Wrap notification card with motion.div

```tsx
import { motion } from 'framer-motion';
// ... existing imports

function NotificationCard({ notification }: NotificationCardProps) {
  // ... existing code

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      transition={{
        type: "spring",
        stiffness: 300,
        damping: 30,
        layout: { type: "spring", stiffness: 400, damping: 35 }
      }}
    >
      {/* existing notification JSX */}
    </motion.div>
  );
}
```

### Success Criteria:

#### Automated Verification:
- [ ] TypeScript compilation passes: `npm run build`
- [ ] No linting errors: `npm run lint`

#### Manual Verification:
- [ ] New notifications appear with spring animation from top
- [ ] Existing notifications smoothly push down when new ones arrive
- [ ] Animation timing feels responsive (<500ms)
- [ ] No janky movements or layout shifts

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the spring animations work smoothly before proceeding to the next phase.

---

## Phase 4: Visual Depth Effects

### Overview
Add visual depth effects including opacity reduction, scaling, and shadows for older notifications.

### Changes Required:

#### 1. Add depth-based styling
**File**: `notifyhub/frontend/src/components/NotificationCard.tsx`
**Changes**: Add index prop and depth calculations

```tsx
interface NotificationCardProps {
  notification: INotification;
  index: number; // Add index for depth calculation
  total: number; // Add total for depth calculation
}

function NotificationCard({ notification, index, total }: NotificationCardProps) {
  // ... existing code

  // Calculate depth effects (newer = less depth)
  const depthFactor = Math.min(index / Math.max(total - 1, 1), 1);
  const opacity = 1 - (depthFactor * 0.2); // 20% opacity reduction
  const scale = 1 - (depthFactor * 0.05); // 5% scaling reduction

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: opacity, y: 0, scale: scale }}
      exit={{ opacity: 0, y: -20 }}
      transition={{
        type: "spring",
        stiffness: 300,
        damping: 30,
        layout: { type: "spring", stiffness: 400, damping: 35 }
      }}
      style={{
        filter: `drop-shadow(0 ${depthFactor * 2}px ${depthFactor * 4}px rgba(0,0,0,${depthFactor * 0.1}))`,
      }}
    >
      {/* existing notification JSX */}
    </motion.div>
  );
}
```

#### 2. Update App.tsx to pass index and total
**File**: `notifyhub/frontend/src/App.tsx`
**Changes**: Pass index and total props to NotificationCard

```tsx
<AnimatePresence mode="popLayout">
  <motion.div layout>
    {notifications.map((notification, index) => (
      <NotificationCard
        key={notification.id}
        notification={notification}
        index={index}
        total={notifications.length}
      />
    ))}
  </motion.div>
</AnimatePresence>
```

#### 3. Add CSS optimizations
**File**: `notifyhub/frontend/src/notification.css`
**Changes**: Add GPU acceleration hints

```css
.notification {
  /* ... existing styles */
  will-change: transform, opacity;
}
```

### Success Criteria:

#### Automated Verification:
- [ ] TypeScript compilation passes: `npm run build`
- [ ] No CSS linting errors

#### Manual Verification:
- [ ] Visual depth applied: 20% opacity reduction for older notifications
- [ ] 5% scaling reduction applied to older notifications
- [ ] Subtle drop shadows visible for layering effect
- [ ] Depth effects look natural and Apple-like

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the visual depth effects look correct before proceeding to the next phase.

---

## Phase 5: Performance Testing and Optimization

### Overview
Test performance with large notification loads and optimize as needed.

### Changes Required:

#### 1. Add performance monitoring (if needed)
**File**: `notifyhub/frontend/src/App.tsx`
**Changes**: Add performance logging for animation timing

```tsx
// Add performance monitoring in development
if (process.env.NODE_ENV === 'development') {
  console.log(`Rendering ${notifications.length} notifications`);
}
```

### Success Criteria:

#### Automated Verification:
- [ ] No performance regressions: `npm run build` completes in reasonable time
- [ ] Bundle size acceptable: Check bundle analyzer if available

#### Manual Verification:
- [ ] Smooth performance with 50+ notifications
- [ ] No animation-related performance issues in production
- [ ] 60fps maintained during animations (use browser dev tools)
- [ ] Memory usage stays reasonable with large notification lists

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that performance is acceptable before proceeding to the final phase.

---

## Phase 6: Polish and Final Testing

### Overview
Fine-tune animation timing, add final polish, and comprehensive testing.

### Changes Required:

#### 1. Fine-tune animation parameters
**File**: `notifyhub/frontend/src/components/NotificationCard.tsx`
**Changes**: Adjust spring parameters for optimal feel

```tsx
transition={{
  type: "spring",
  stiffness: 350, // Slightly snappier
  damping: 35,    // Smoother damping
  layout: { type: "spring", stiffness: 450, damping: 40 }
}}
```

#### 2. Add CSS containment for performance
**File**: `notifyhub/frontend/src/notification.css`
**Changes**: Add CSS containment for better performance

```css
.notification {
  /* ... existing styles */
  contain: layout style paint;
}
```

### Success Criteria:

#### Automated Verification:
- [ ] All Playwright tests pass: `npx playwright test`
- [ ] No console errors or warnings
- [ ] TypeScript strict mode passes

#### Manual Verification:
- [ ] Animation timing feels perfect (<500ms completion)
- [ ] Works across desktop and mobile viewports
- [ ] No regressions in existing functionality
- [ ] User satisfaction testing shows positive feedback

## Testing Strategy

### Unit Tests:
- Test depth calculation functions
- Test animation prop calculations
- Verify Framer Motion integration

### Integration Tests:
- Test notification addition triggers correct animations
- Verify stacking behavior with multiple notifications
- Test animation performance metrics

### Manual Testing Steps:
1. Add single notification - verify smooth insertion
2. Add multiple notifications rapidly - verify stacking effect
3. Test with 50+ notifications - verify performance
4. Test on mobile viewport - verify responsive behavior
5. Test with audio notifications - verify no interference

## Performance Considerations

- **GPU Acceleration**: Framer Motion uses transform/opacity which are GPU-accelerated
- **Bundle Size**: ~60KB gzipped for Framer Motion (acceptable)
- **Memory**: AnimatePresence manages component lifecycle efficiently
- **Large Lists**: Layout animations optimized for dynamic content
- **Mobile**: Touch-friendly animations with appropriate spring constants

## Migration Notes

- **Backwards Compatibility**: Animation is additive - existing functionality preserved
- **Graceful Degradation**: If Framer Motion fails to load, notifications still display statically
- **Bundle Splitting**: Consider lazy loading Framer Motion if bundle size becomes concern

## References

- Framer Motion documentation: https://motion.dev/docs
- Apple Human Interface Guidelines: Notification patterns
- Issue: `docs/issues/2025-12-30-apply-apple-notification-stacking.md`