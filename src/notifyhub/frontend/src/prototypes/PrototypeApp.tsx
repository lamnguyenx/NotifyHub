import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { AppView } from '../AppView';
import type { NotificationItem } from '../types';
import { buildScenarios } from './scenarios';
import './prototype.css';

interface PrototypeBarProps {
  index: number;
  total: number;
  title: string;
  blurb: string;
  frozen: boolean;
}

function PrototypeBar({ index, total, title, blurb, frozen }: PrototypeBarProps) {
  return (
    <div className="nh-proto-bar">
      <strong>
        PROTOTYPE {index}/{total}
      </strong>
      <span className="nh-proto-title">{title}</span>
      <span className="nh-proto-blurb">{blurb}</span>
      <span className="nh-spacer" />
      <span>
        <span className="nh-proto-key">1–7</span> scenario
      </span>
      <span>
        <span className="nh-proto-key">n/p</span> cycle
      </span>
      <span>
        <span className="nh-proto-key">t</span> time {frozen ? 'frozen' : 'live'}
      </span>
      <span>
        <span className="nh-proto-key">r</span> restart
      </span>
      <span className="nh-proto-mock">mock data</span>
    </div>
  );
}

/**
 * Standalone web harness. It runs the real AppView and components with fake
 * data, so layout, theme, popups and overflow behave like the app.
 * See docs/_meta/how-to-prototype.md.
 */
export function PrototypeApp() {
  const [scenarioIdx, setScenarioIdx] = useState(0);
  const [referenceNow, setReferenceNow] = useState(() => new Date());
  const [frozenAt, setFrozenAt] = useState<Date | null>(null);
  const [deleted, setDeleted] = useState<string[]>([]);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMoreOverride, setHasMoreOverride] = useState<boolean | null>(null);
  const [restartKey, setRestartKey] = useState(0);
  const loadTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const scenarios = useMemo(() => buildScenarios(referenceNow), [referenceNow]);
  const scenario = scenarios[scenarioIdx] ?? scenarios[0]!;
  const hasMore = hasMoreOverride ?? scenario.hasMore;

  const clearLoadTimer = useCallback(() => {
    if (loadTimer.current) {
      clearTimeout(loadTimer.current);
      loadTimer.current = null;
    }
  }, []);

  useEffect(() => clearLoadTimer, [clearLoadTimer]);

  const selectScenario = useCallback(
    (index: number) => {
      const count = scenarios.length;
      const next = ((index % count) + count) % count;
      clearLoadTimer();
      setLoadingMore(false);
      setHasMoreOverride(null);
      setScenarioIdx(next);
      setDeleted([]);
      if (!frozenAt) setReferenceNow(new Date());
    },
    [scenarios.length, frozenAt, clearLoadTimer],
  );

  /** Fresh launch: scenario 1, live clock, no deletions or pending page load. */
  const restart = useCallback(() => {
    clearLoadTimer();
    setScenarioIdx(0);
    setReferenceNow(new Date());
    setFrozenAt(null);
    setDeleted([]);
    setLoadingMore(false);
    setHasMoreOverride(null);
    setRestartKey((key) => key + 1);
  }, [clearLoadTimer]);

  const toggleFreeze = useCallback(() => {
    if (frozenAt) {
      setFrozenAt(null);
      setReferenceNow(new Date());
    } else {
      const t = new Date();
      setFrozenAt(t);
      setReferenceNow(t);
    }
  }, [frozenAt]);

  const loadMore = useCallback(() => {
    if (!hasMore || loadingMore) return;
    setLoadingMore(true);
    loadTimer.current = setTimeout(() => {
      // One fake page is enough to show the loading state and the end of
      // history; the prototype does not append rows.
      setLoadingMore(false);
      setHasMoreOverride(false);
      loadTimer.current = null;
    }, 700);
  }, [hasMore, loadingMore]);

  const handleDelete = useCallback((id: string) => {
    setDeleted((prev) => (prev.includes(id) ? prev : [...prev, id]));
  }, []);

  const handleClearAll = useCallback(() => {
    setDeleted(scenario.notifications.map((n) => n.id));
  }, [scenario.notifications]);

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

      if (event.key === 'r') {
        event.preventDefault();
        restart();
      } else if (event.key === 'n') {
        event.preventDefault();
        selectScenario(scenarioIdx + 1);
      } else if (event.key === 'p') {
        event.preventDefault();
        selectScenario(scenarioIdx - 1);
      } else if (event.key === 't') {
        event.preventDefault();
        toggleFreeze();
      } else if (/^[1-9]$/.test(event.key)) {
        const index = Number(event.key) - 1;
        if (index < scenarios.length) {
          event.preventDefault();
          selectScenario(index);
        }
      }
    };

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [restart, selectScenario, scenarioIdx, scenarios.length, toggleFreeze]);

  const notifications: NotificationItem[] = scenario.notifications.filter(
    (n) => !deleted.includes(n.id),
  );

  return (
    <AppView
      key={restartKey}
      header={
        <PrototypeBar
          index={scenarioIdx + 1}
          total={scenarios.length}
          title={scenario.title}
          blurb={scenario.blurb}
          frozen={frozenAt !== null}
        />
      }
      notifications={notifications}
      agentStatus={scenario.agentStatus}
      serverInfo={scenario.serverInfo}
      hasMore={hasMore}
      loadingMore={loadingMore}
      onDelete={handleDelete}
      onClearAll={handleClearAll}
      onLoadMore={loadMore}
      lockedCount={notifications.filter((n) => n.locked).length}
      now={frozenAt ?? undefined}
      footerExtra="r: restart"
    />
  );
}

export default PrototypeApp;
