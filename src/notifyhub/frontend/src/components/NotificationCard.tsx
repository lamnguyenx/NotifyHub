import type { CSSProperties } from 'react';
import { IconX } from '@tabler/icons-react';

import type { NotificationItem } from '../types';
import {
  getAvatarColor,
  getHostModelColor,
  getTitle,
  isEnvelope,
  parseMessage,
  truncate,
} from '../utils/cardUtils';
import { formatRelativeTime } from '../utils/timestampUtils';

interface NotificationCardProps {
  item: NotificationItem;
  now?: Date;
  onDelete?: (id: string) => void;
}

function envelopeKid(item: NotificationItem): string {
  return isEnvelope(item.data) ? String(item.data.kid ?? '?') : '?';
}

function DeleteButton({ id, onDelete }: { id: string; onDelete?: (id: string) => void }) {
  if (!onDelete) return null;
  return (
    <button
      type="button"
      className="nh-delete"
      aria-label="Delete notification"
      title="Delete notification"
      onClick={() => onDelete(id)}
    >
      <IconX size={14} stroke={2} />
    </button>
  );
}

function LockedCard({ item, now, onDelete }: NotificationCardProps) {
  return (
    <article className="nh-card nh-card-locked" data-id={item.id}>
      <div className="nh-card-header">
        <span className="nh-locked-label">LOCKED</span>
        <span className="nh-spacer" />
        <time className="nh-time">{formatRelativeTime(item.timestamp, now)}</time>
        <DeleteButton id={item.id} onDelete={onDelete} />
      </div>
      <div className="nh-locked-body">encrypted notification (kid {envelopeKid(item)})</div>
      <div className="nh-locked-hint">
        the web UI does not decrypt e2e payloads — use the TUI to read it
      </div>
    </article>
  );
}

function PlainCard({ item, now, onDelete }: NotificationCardProps) {
  const data = (item.data ?? {}) as Record<string, unknown>;
  const msg = typeof data.message === 'string' ? data.message : '';
  const pwd = typeof data.pwd === 'string' ? data.pwd : '';
  const hostModel = typeof data.host_model === 'string' ? data.host_model : '';
  const title = getTitle(pwd);
  const avatarColor = getAvatarColor(pwd || item.id);
  const avatarInitial = title[0]?.toUpperCase() || 'N';
  const hostModelColor = hostModel ? getHostModelColor(hostModel) : '';
  const time = formatRelativeTime(item.timestamp, now);
  // Drop trailing blank lines so cards don't end with empty padding.
  const messageLines = msg.replace(/\s+$/, '').split('\n');

  return (
    <article className="nh-card" data-id={item.id}>
      <div className="nh-card-header">
        <span className="nh-avatar" style={{ backgroundColor: avatarColor }}>
          {avatarInitial}
        </span>
        <span className="nh-title" title={title}>
          {title}
        </span>
        <span className="nh-spacer" />
        {hostModel ? (
          <span
            className="nh-pill"
            style={{ '--nh-pill-color': hostModelColor } as CSSProperties}
            title={`host: ${hostModel}`}
          >
            {hostModel}
          </span>
        ) : (
          <>
            <time className="nh-time">{time}</time>
            <DeleteButton id={item.id} onDelete={onDelete} />
          </>
        )}
      </div>

      {hostModel ? (
        <div className="nh-time-row">
          <time className="nh-time">{time}</time>
          <DeleteButton id={item.id} onDelete={onDelete} />
        </div>
      ) : null}

      {pwd ? (
        <div className="nh-pwd" title={pwd}>
          {truncate(pwd, 80)}
        </div>
      ) : null}

      <div className="nh-message">
        {messageLines.map((line, lineIdx) => {
          const segments = parseMessage(line);
          return (
            <div className="nh-message-line" key={`msg-ln-${lineIdx}`}>
              {segments.length > 0
                ? segments.map((seg, i) => (
                    <span key={`${lineIdx}-${seg.type}-${i}`} className={`nh-${seg.type}`}>
                      {seg.text}
                    </span>
                  ))
                : '\u00a0'}
            </div>
          );
        })}
      </div>
    </article>
  );
}

/**
 * Dispatcher only: locked and plain cards are separate components so the
 * hook order never changes when a row switches between them.
 */
export function NotificationCard(props: NotificationCardProps) {
  return props.item.locked ? <LockedCard {...props} /> : <PlainCard {...props} />;
}

export default NotificationCard;
