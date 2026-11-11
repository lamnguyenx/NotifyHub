import { useEffect, useState } from 'react';
import type { CSSProperties } from 'react';

import type { AgentStatusEntry } from '../types';
import {
  AGENT_GLYPH,
  HOST_GLYPH,
  effectiveAgentState,
  getAvatarColor,
  getHostModelColor,
  getTitle,
  loadingWordFor,
  truncate,
} from '../utils/cardUtils';
import { formatRelativeTime } from '../utils/timestampUtils';

const SPINNER_FRAMES = ['\u280b', '\u2819', '\u2839', '\u2838', '\u283c', '\u2834', '\u2826', '\u2827', '\u2807', '\u280f'];
const SPINNER_INTERVAL_MS = 120;

function useTicker(active: boolean): number {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setTick((t) => t + 1), SPINNER_INTERVAL_MS);
    return () => clearInterval(id);
  }, [active]);
  return tick;
}

interface WaitingCardProps {
  entry: AgentStatusEntry;
  now: Date;
}

/**
 * A notification card that has not arrived yet: the same chrome as a real
 * card, with the running prompt on `@USER` and a live `@ASSISTANT` line.
 */
function WaitingCard({ entry, now }: WaitingCardProps) {
  const state = effectiveAgentState(entry, now);
  const tick = useTicker(state === 'running');
  const spinner = SPINNER_FRAMES[tick % SPINNER_FRAMES.length];
  const loadingWord = loadingWordFor(`${entry.session_id}:${entry.task?.trim() ?? ''}`);
  const pwd = entry.pwd ?? '';
  const title = getTitle(entry.pwd);
  const avatarColor = getAvatarColor(entry.pwd ?? entry.session_id);
  const avatarInitial = title[0]?.toUpperCase() || 'N';
  const agent = entry.agent || 'agent';
  const glyph = AGENT_GLYPH[agent] ?? '\u25cf';
  const agentColor = getHostModelColor(agent);
  const host = entry.host?.trim() ?? '';
  const hostColor = host ? getHostModelColor(host) : '';
  const elapsed = formatRelativeTime(entry.since, now);
  const task = entry.task?.trim() ?? '';

  return (
    <article className={`nh-card nh-waiting-card nh-wait-${state}`}>
      <div className="nh-card-header">
        <span className="nh-avatar" style={{ backgroundColor: avatarColor }}>
          {avatarInitial}
        </span>
        <span className="nh-title" title={title}>
          {title}
        </span>
        <span className="nh-spacer" />
        <span
          className="nh-pill"
          style={{ '--nh-pill-color': agentColor } as CSSProperties}
          title={`agent: ${agent}`}
        >
          {glyph} {agent}
        </span>
        {host ? (
          <span
            className="nh-pill"
            style={{ '--nh-pill-color': hostColor } as CSSProperties}
            title={`host: ${host}`}
          >
            {HOST_GLYPH} {truncate(host, 24)}
          </span>
        ) : null}
      </div>

      <div className="nh-time-row">
        <time className="nh-time">{elapsed}</time>
      </div>

      {pwd ? (
        <div className="nh-pwd" title={pwd}>
          {truncate(pwd, 80)}
        </div>
      ) : null}

      <div className="nh-task">
        <span className="nh-label">@USER</span>{' '}
        {task ? task : <span className="nh-dim">(no task excerpt)</span>}
      </div>

      <div className="nh-assistant-row">
        <span className="nh-label">@ASSISTANT</span>
        <span className="nh-spacer" />
        <span className={`nh-wait-status nh-wait-status-${state}`}>
          {state === 'running' ? (
            <>
              <span className="nh-loading-word">{loadingWord}</span>{' '}
              <span className="nh-spinner">{spinner}</span>
            </>
          ) : state === 'blocked' ? (
            <>waiting for you {'\u26a0'}</>
          ) : state === 'stale' ? (
            <>stalled? {'\u25fc'}</>
          ) : (
            'idle'
          )}
        </span>
      </div>
    </article>
  );
}

interface WaitingCardsProps {
  entries: AgentStatusEntry[];
  now: Date;
}

/**
 * Waiting cards above the notification stream. Only sessions in motion are
 * shown; idle entries are hidden (their completion already rendered as a
 * notification card).
 */
export function WaitingCards({ entries, now }: WaitingCardsProps) {
  const live = entries
    .filter((e) => e.state !== 'idle')
    .sort((a, b) => Date.parse(b.updated) - Date.parse(a.updated));
  if (live.length === 0) return null;

  return (
    <section className="nh-waiting-stack" aria-label="Live agent sessions">
      {live.map((entry) => (
        <WaitingCard key={`${entry.agent}:${entry.session_id}`} entry={entry} now={now} />
      ))}
    </section>
  );
}

export default WaitingCards;
