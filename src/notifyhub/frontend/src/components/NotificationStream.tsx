import { useEffect, useRef } from 'react';

import type { NotificationItem } from '../types';
import { NotificationCard } from './NotificationCard';

interface NotificationStreamProps {
  notifications: NotificationItem[];
  onDelete?: (id: string) => void;
  hasMore?: boolean;
  loadingMore?: boolean;
  onLoadMore?: () => void;
  /** Frozen clock for prototypes and screenshots; omit for the live clock. */
  now?: Date;
}

export function NotificationStream({
  notifications,
  onDelete,
  hasMore,
  loadingMore,
  onLoadMore,
  now,
}: NotificationStreamProps) {
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  // Auto-load the next page when the end of the feed comes into view.
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !hasMore || loadingMore || !onLoadMore) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) onLoadMore();
      },
      { rootMargin: '240px' },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasMore, loadingMore, onLoadMore]);

  return (
    <main className="nh-stream">
      {notifications.length === 0 ? (
        <div className="nh-empty">
          <span className="nh-empty-title">Waiting for notifications…</span>
          <span className="nh-empty-hint">
            Push one with the CLI, or let an agent finish a turn.
          </span>
        </div>
      ) : (
        notifications.map((item) => (
          <NotificationCard key={item.id} item={item} now={now} onDelete={onDelete} />
        ))
      )}

      {hasMore ? (
        <div className="nh-load-more" ref={sentinelRef}>
          {loadingMore ? (
            <span>Loading older notifications…</span>
          ) : (
            <button type="button" onClick={onLoadMore}>
              Load older notifications
            </button>
          )}
        </div>
      ) : null}
    </main>
  );
}

export default NotificationStream;
