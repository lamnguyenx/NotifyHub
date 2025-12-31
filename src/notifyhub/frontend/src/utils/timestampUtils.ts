export function formatTimestamp(timestamp: string): string {
  const now = new Date();
  const time = new Date(timestamp);
  const diffMs = now.getTime() - time.getTime();

  if (diffMs < 60000) {
    return 'now';
  }

  const diffMins = Math.floor(diffMs / (1000 * 60));
  if (diffMins < 60) {
    return `${diffMins}m ago`;
  }

  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  if (diffHours < 24) {
    return `${diffHours}h ago`;
  }

  // Check if yesterday (previous calendar day)
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (time.toDateString() === yesterday.toDateString()) {
    return 'Yesterday';
  }

  // Older than 2 days: full date
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays > 1) {
    return time.toLocaleDateString('en-US', {
      month: '2-digit',
      day: '2-digit',
      year: '2-digit'
    });
  }

  return 'Yesterday'; // fallback
}