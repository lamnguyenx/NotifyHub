Google's default avatar system is essentially a way to turn a "blank" profile into a unique **visual ID card**. Instead of using a generic silhouette that makes a user feel like a ghost in the machine, they use a logic-driven design approach.

Here is how the system works at a high level:

### 1. Visual Hierarchy

Google uses **initials** as the primary identifier.

* If you provide a full name (e.g., "Sam Smith"), it shows **SS**.
* If you only provide a first name, it shows a single large **S**.
* This makes users instantly recognizable in a list of emails or a shared document without needing a photo.

### 2. Consistency Through Color

The most clever part of the system is that your assigned color isn't random. Once Google assigns you a specific background color (like a certain shade of Blue or Green), it stays with you.

* This creates **visual muscle memory**: you eventually stop reading the letters and simply look for "the purple circle" to find your own comments or emails.
* The colors are pulled from a specific "Material Design" palette that ensures the white letters are always easy to read.


### 3. Why it works

The design succeeds because it fills an **"empty state."** A profile with a missing photo feels unfinished; a profile with a colorful, letter-based avatar feels **curated**. It bridges the gap between a brand-new account and a fully personalized digital identity.

---

When a user hasn't uploaded a profile picture in Gmail, Google assigns a circular avatar with their first initial set against a colored background. These colors are not random every time you refresh; they are typically tied to the user's ID or name so they remain consistent across Google services.

Here are the specific hex codes for those placeholder backgrounds:

### The "Letter Tile" Color Palette

Google uses a specific array of Material Design colors for these "initials" avatars. While the palette has evolved slightly over the years, the following are the most common hex codes used in the modern Gmail interface:

| Color Name | Hex Code |
| --- | --- |
| **Royal Purple** | `#7B1FA2` |
| **Slate Gray** | `#77919D` |
| **Charcoal Blue** | `#455A65` |
| **Neon Pink** | `#EC417A` |
| **Crimson Rose** | `#C1175C` |
| **Indigo Blue** | `#5D6AC0` |
| **Sky Blue** | `#0388D2` |
| **Navy** | `#00579B` |
| **Teal Blue** | `#0098A7` |
| **Deep Teal** | `#00897B` |
| **Forest Green** | `#004D40` |
| **Leaf Green** | `#68A039` |
| **Vivid Orange** | `#EF6C00` |
| **Fiery Coral** | `#F6511E` |
| **Brick Red** | `#BE360B` |

---

### Technical Summary

The colors are applied based on a "Letter Tile" logic. In the Android source code and Gmail's web CSS, these are often defined as a fixed array.

```text
"""
Gmail Avatar Color Logic:
- Background: Selected from the palette above (e.g., #7B1FA2).
- Initial (Foreground): Always #FFFFFF (Pure White).
- Font: Roboto or Product Sans (Google's custom typeface).
"""
```

### Why does the color change?

If you see a different color for the same person, it's usually because:

1. **Multiple Accounts:** You might have two contacts with the same name but different email addresses.
2. **Algorithm Update:** Google occasionally refreshes the palette to match new Material Design guidelines (e.g., shifting from the "500" weight colors to the more muted "700" or "800" weights).

**Would you like me to find the specific color assigned to a certain letter, or help you generate a similar "initials avatar" using code?**