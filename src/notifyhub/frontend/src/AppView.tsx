import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';

import type { AgentStatusEntry, NotificationItem, ServerInfo } from './types';
import { useNow } from './hooks/useNow';
import { WaitingCards } from './components/WaitingCards';
import { NotificationStream } from './components/NotificationStream';
import { StatusPopup } from './components/StatusPopup';
import { HelpPopup } from './components/HelpPopup';

export interface AppViewProps {
  notifications: NotificationItem[];
  agentStatus: AgentStatusEntry[];
  serverInfo: ServerInfo;
  hasMore?: boolean;
  loadingMore?: boolean;
  onDelete: (id: string) => void;
  onClearAll: () => void;
  onLoadMore?: () => void;
  lockedCount?: number;
  /** Browser autoplay was blocked; show the click-to-enable banner. */
  audioBlocked?: boolean;
  /** Frozen clock for prototypes and screenshots; omit for the live clock. */
  now?: Date;
  /** Harness chrome rendered above the app header (prototype only). */
  header?: ReactNode;
  /** Appended to the footer hints (prototype only). */
  footerExtra?: string;
}

/**
 * The app's presentation shell, independent of where the data comes from.
 * `App` wires the live SSE store; the prototype harness wires fixtures.
 */
export function AppView({
  notifications,
  agentStatus,
  serverInfo,
  hasMore,
  loadingMore,
  onDelete,
  onClearAll,
  onLoadMore,
  lockedCount = 0,
  audioBlocked = false,
  now: frozenNow,
  header,
  footerExtra,
}: AppViewProps) {
  const [showStatus, setShowStatus] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const liveNow = useNow(10_000);
  const now = frozenNow ?? liveNow;
  const { connected, streaming } = serverInfo;
  const count = Math.max(serverInfo.notificationsCount, notifications.length);
  const statusClass = streaming ? 'nh-status-live' : connected ? 'nh-status-wait' : 'nh-status-off';
  const statusText = streaming ? '\u25cf Live' : connected ? '\u25d0 Reconnecting' : '\u25cb Offline';

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable)
      ) {
        return;
      }

      if (event.key === 's') {
        event.preventDefault();
        setShowStatus((value) => !value);
        setShowHelp(false);
      } else if (event.key === 'h' || event.key === '?') {
        event.preventDefault();
        setShowHelp((value) => !value);
        setShowStatus(false);
      } else if (event.key === 'l') {
        if (hasMore && !loadingMore) onLoadMore?.();
      } else if (event.key === 'Escape') {
        setShowStatus(false);
        setShowHelp(false);
      }
    };

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [hasMore, loadingMore, onLoadMore]);

  return (
    <div className="nh-app">
      {header}

      <div className="nh-shell">
        <header className="nh-header">
          <div className="nh-brand">
            <h1 className="nh-heading">Notification Center</h1>
            <span className={`nh-status ${statusClass}`}>{statusText}</span>
            <span className="nh-count" title={`${count} notifications`}>
              {count}
            </span>
          </div>

          <div className="nh-header-actions">
            <button
              type="button"
              className="nh-button"
              onClick={() => {
                setShowStatus((value) => !value);
                setShowHelp(false);
              }}
              title="Status (s)"
            >
              Status
            </button>
            <button
              type="button"
              className="nh-button"
              onClick={() => {
                setShowHelp((value) => !value);
                setShowStatus(false);
              }}
              title="Keys (h)"
            >
              ?
            </button>
            <button
              type="button"
              className="nh-button nh-button-danger"
              onClick={onClearAll}
              disabled={notifications.length === 0}
              title="Clear all notifications"
            >
              Clear all
            </button>
          </div>
        </header>

        {audioBlocked ? (
          <div className="nh-alert">
            Audio notifications are muted. Click anywhere on the page to enable them.
          </div>
        ) : null}

        {!streaming ? (
          <div className="nh-alert nh-alert-warning">
            {connected ? 'Live updates paused — reconnecting…' : 'Connection lost — retrying…'}
          </div>
        ) : null}

        <WaitingCards entries={agentStatus} now={now} />
        <NotificationStream
          notifications={notifications}
          onDelete={onDelete}
          hasMore={hasMore}
          loadingMore={loadingMore}
          onLoadMore={onLoadMore}
          now={now}
        />
      </div>

      <StatusPopup
        opened={showStatus}
        onClose={() => setShowStatus(false)}
        serverInfo={serverInfo}
        notificationsCount={count}
        lockedCount={lockedCount}
      />
      <HelpPopup opened={showHelp} onClose={() => setShowHelp(false)} />

      <footer className="nh-footer">
        <span>
          {hasMore ? 'l: older · ' : ''}s: status · h: help · hover ×: delete
        </span>
        {loadingMore ? ' · loading older…' : hasMore ? ' · more below' : ''}
        {footerExtra ? ` · ${footerExtra}` : ''}
      </footer>
    </div>
  );
}

export default AppView;
