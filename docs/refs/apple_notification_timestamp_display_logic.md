# iOS Notification Timestamp Display Logic

### 1. The "Just Now" Phase

* **0s to 59s:** Displays as **"now"**.
* *Note:* Apple does not show seconds. It remains "now" until exactly 60 seconds have passed.

### 2. The Minute Phase

* **1m to 59m:** Displays as **"1m ago"**, **"2m ago"**, etc.
* **The Switch:** As soon as the clock hits `T + 60s`, it becomes "1m ago".
* **Visual Style:** iOS uses the short form (m) rather than "minutes" in the notification lock screen to save space.

### 3. The Hour Phase

* **60m to 23h:** Displays as **"1h ago"** to **"23h ago"**.
* **The Switch:** It flips from "59m ago" to "1h ago" at exactly 60 minutes. It does **not** round up early (e.g., 50 minutes does not become "1 hour").

### 4. The Day & Date Transition (Crucial)

This is where iOS behavior differs from standard "time ago" libraries like Moment.js or Day.js.

* **Within 24 Hours:** If the notification is from the current calendar day, it stays in the "Xh ago" format.
* **Yesterday:** Once the clock passes midnight, the notification usually switches to **"Yesterday"**.
* **Beyond 24-48 Hours:** Once it is older than "Yesterday," it switches to the **Full Date** (e.g., "11/24/25" or "Nov 24"). It stops being relative entirely.

---

### Logic Summary Table

| Time Elapsed | iOS / macOS Display |
| --- | --- |
| < 60 seconds | **now** |
| 60s – 59m 59s | **Xm ago** (e.g., 5m ago) |
| 1h – 23h 59m | **Xh ago** (e.g., 3h ago) |
| Next Calendar Day | **Yesterday** |
| > 2 Days | **MM/DD/YY** (e.g., 10/12/24) |

---
