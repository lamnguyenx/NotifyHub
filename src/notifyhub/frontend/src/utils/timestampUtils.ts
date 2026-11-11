/**
 * Relative timestamp used by the notification cards. Mirrors the TUI's
 * `formatRelativeTime` so both clients read the same: `now`, `5m ago`,
 * `3h ago`, `Yesterday`, or `MM/DD/YY`.
 */
export function formatRelativeTime(iso: string, now: Date = new Date()): string {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;

    const elapsed = Math.max(0, now.getTime() - d.getTime());

    const nowDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const msgDay = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const dayDiff = Math.round((nowDay.getTime() - msgDay.getTime()) / 86400000);

    if (dayDiff >= 2) {
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      const year = String(d.getFullYear()).slice(-2);
      return `${month}/${day}/${year}`;
    }

    if (dayDiff === 1) return 'Yesterday';

    const secs = Math.floor(elapsed / 1000);
    if (secs < 60) return 'now';

    const mins = Math.floor(secs / 60);
    if (mins < 60) return `${mins}m ago`;

    const hours = Math.floor(mins / 60);
    return `${hours}h ago`;
  } catch {
    return iso;
  }
}

/** Backwards-compatible alias for the live clock. */
export function formatTimestamp(timestamp: string): string {
  return formatRelativeTime(timestamp);
}
