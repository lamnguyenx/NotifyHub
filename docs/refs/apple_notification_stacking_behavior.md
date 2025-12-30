In the iOS Notification Center (and the Lock Screen), the behavior you're describing is a core part of Apple’s **"Stacking"** system, which was significantly overhauled starting with iOS 16 and refined in subsequent versions.

The specific "bubbling up" sensation happens because of how the system manages the **Z-axis** (depth) and the **Y-axis** (vertical position). Here is a breakdown of that behavior:

### 1. The "Push Down" Effect

When a new notification arrives, the existing list or stack is shifted downward to make room at the top.

* **The Logic:** Newer notifications are prioritized at the top of the stack (or the top of the list) to ensure they are the first thing you see.
* **The Animation:** It isn't a simple "cut and paste." Instead, the existing notifications perform a **fluid spring animation** where they compress slightly and move downward together as a unit.

### 2. The "Bubble Up" (Arrival)

You mentioned they "bubble up." This is a perfect way to describe the **arrival animation**:

* **Roll-in:** Notifications on modern iOS actually "roll in" or slide up from the bottom of the screen initially, then settle into their position.
* **Expansion:** If you have multiple notifications from the same app, the new one appears to "emerge" from the top of the stack, while the older ones tuck behind it, creating a 3D layered look.

### 3. Layers and Depth

Apple uses a "glass" or "material" effect to help with this:

* **Transparency:** Older notifications that have been pushed down often become slightly more transparent or smaller to show they are "receding" into the background.
* **Shadows:** Each notification card has a subtle drop shadow. When a new one arrives, its shadow overlaps the ones below it, reinforcing the idea that it is physically on top.

### 4. Customizing the "Flow"

If you don't like how they push each other around, you can actually change this in **Settings > Notifications > Display As**:

* **Count:** Everything is hidden behind a single number at the bottom; nothing "bubbles" until you tap it.
* **Stack (Default):** This is the behavior you described—notifications stack at the bottom and "bubble" into a pile.
* **List:** This spreads them out across the screen, similar to older versions of iOS, but they still push older items down as new ones arrive.

---

### Visualization of the Animation Logic

If you were to look at the code-like logic for how these move, it would look something like this:

```swift
"""
// Simplified Logic for Notification Positioning
struct NotificationStack {
    var notifications: [Notification]

    mutating func addNewNotification(_ newNoti: Notification) {
        // 1. Insert at the top (index 0)
        notifications.insert(newNoti, at: 0)

        // 2. Apply "Push Down" animation to others
        for (index, noti) in notifications.enumerated() {
            if index > 0 {
                noti.applySpringAnimation(offsetY: stackHeight * index)
                noti.adjustOpacity(0.8) // Fade out older ones slightly
                noti.scale(0.95)         // Shrink older ones slightly
            }
        }
    }
}
"""

```
