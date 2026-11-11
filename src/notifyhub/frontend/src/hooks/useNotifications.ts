import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  AgentStatusEntry,
  EncryptedEnvelope,
  NotificationData,
  NotificationItem,
  ServerInfo,
} from '../types';
import { isEnvelope } from '../utils/cardUtils';

/** Notifications loaded per page (initial SSE `init` + lazy `loadMore`). */
export const PAGE_SIZE = 30;
const STATUS_POLL_MS = 15_000;

function safeParse<T>(json: string, fallback: T): T {
  try {
    return JSON.parse(json) as T;
  } catch {
    return fallback;
  }
}

function defaultHost(): string {
  return window.location.hostname || 'localhost';
}

function defaultPort(): number {
  if (window.location.port) return Number(window.location.port);
  return window.location.protocol === 'https:' ? 443 : 80;
}

function parseNotification(raw: unknown): NotificationItem | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const record = raw as Record<string, unknown>;
  if (typeof record.id !== 'string' || typeof record.timestamp !== 'string') return null;
  const data =
    typeof record.data === 'object' && record.data !== null
      ? (record.data as NotificationData | EncryptedEnvelope)
      : {};
  return {
    id: record.id,
    timestamp: record.timestamp,
    data,
    ...(isEnvelope(data) ? { locked: true } : {}),
  };
}

function parseNotificationList(raw: unknown): NotificationItem[] {
  if (!Array.isArray(raw)) return [];
  return raw.map(parseNotification).filter((item): item is NotificationItem => item !== null);
}

/**
 * Live agent statuses. The web client cannot decrypt e2e payloads, so an
 * encrypted entry is dropped rather than shown as a broken waiting card.
 */
function parseStatusEntry(raw: unknown): AgentStatusEntry | null {
  if (isEnvelope(raw)) return null;
  if (typeof raw !== 'object' || raw === null) return null;
  const entry = raw as Record<string, unknown>;
  if (
    typeof entry.agent !== 'string' ||
    typeof entry.session_id !== 'string' ||
    typeof entry.state !== 'string'
  ) {
    return null;
  }
  return entry as unknown as AgentStatusEntry;
}

function parseStatusList(raw: unknown): AgentStatusEntry[] {
  const agents = (raw as { agents?: unknown })?.agents;
  if (!Array.isArray(agents)) return [];
  return agents.map(parseStatusEntry).filter((entry): entry is AgentStatusEntry => entry !== null);
}

export function useNotifications() {
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [agentStatus, setAgentStatus] = useState<AgentStatusEntry[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const loadingRef = useRef(false);
  /** Increments only for live SSE arrivals (not init or older pages). */
  const [liveEventSeq, setLiveEventSeq] = useState(0);
  const [serverInfo, setServerInfo] = useState<ServerInfo>({
    connected: false,
    streaming: false,
    notificationsCount: 0,
    host: defaultHost(),
    port: defaultPort(),
  });

  const upsertAgentStatus = useCallback((entry: AgentStatusEntry) => {
    setAgentStatus((prev) => {
      const next = prev.filter((e) => e.session_id !== entry.session_id);
      next.unshift(entry);
      return next;
    });
  }, []);

  const removeAgentStatus = useCallback((sessionId: string) => {
    setAgentStatus((prev) => prev.filter((e) => e.session_id !== sessionId));
  }, []);

  const refreshServerInfo = useCallback(async () => {
    try {
      const [countRes, e2eRes] = await Promise.allSettled([
        fetch('/api/notifications/count'),
        fetch('/api/e2e'),
      ]);
      if (countRes.status === 'rejected' || !countRes.value.ok) {
        throw new Error('count failed');
      }
      const countBody = (await countRes.value.json()) as { count?: number };
      const e2e =
        e2eRes.status === 'fulfilled' && e2eRes.value.ok
          ? ((await e2eRes.value.json()) as ServerInfo['e2e'])
          : undefined;
      setServerInfo((prev) => ({
        ...prev,
        connected: true,
        notificationsCount: typeof countBody.count === 'number' ? countBody.count : 0,
        e2e,
      }));
    } catch {
      setServerInfo((prev) => ({ ...prev, connected: false }));
    }
  }, []);

  const syncAgentStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/status');
      if (!res.ok) return;
      setAgentStatus(parseStatusList(await res.json()));
    } catch {
      // Keep the current rows; the next event or reconnect retries.
    }
  }, []);

  useEffect(() => {
    const es = new EventSource(`/events?limit=${PAGE_SIZE}`);

    es.addEventListener('init', (event: MessageEvent) => {
      const items = parseNotificationList(safeParse<unknown>(event.data, []));
      setNotifications(items);
      setHasMore(items.length >= PAGE_SIZE);
      setServerInfo((prev) => ({
        ...prev,
        connected: true,
        streaming: true,
        notificationsCount: Math.max(prev.notificationsCount, items.length),
      }));
    });

    es.addEventListener('notification', (event: MessageEvent) => {
      const item = parseNotification(safeParse<unknown>(event.data, null));
      if (!item) return;
      setNotifications((prev) => {
        if (prev.some((n) => n.id === item.id)) return prev;
        return [item, ...prev];
      });
      setServerInfo((prev) => ({
        ...prev,
        connected: true,
        streaming: true,
        notificationsCount: prev.notificationsCount + 1,
      }));
      setLiveEventSeq((seq) => seq + 1);

      // A completion notification resolves the live row for the same
      // session (both reporters stamp data.session_id).
      const sessionId =
        !item.locked && typeof (item.data as NotificationData).session_id === 'string'
          ? ((item.data as NotificationData).session_id as string)
          : null;
      if (sessionId) removeAgentStatus(sessionId);
    });

    es.addEventListener('agent_status', (event: MessageEvent) => {
      const entry = parseStatusEntry(safeParse<unknown>(event.data, null));
      if (entry) upsertAgentStatus(entry);
    });

    es.addEventListener('delete', (event: MessageEvent) => {
      const parsed = safeParse<{ id?: string }>(event.data, {});
      if (!parsed.id) return;
      setNotifications((prev) => prev.filter((n) => n.id !== parsed.id));
      setServerInfo((prev) => ({
        ...prev,
        notificationsCount: Math.max(0, prev.notificationsCount - 1),
      }));
    });

    es.addEventListener('clear', () => {
      setNotifications([]);
      setHasMore(false);
      setServerInfo((prev) => ({ ...prev, notificationsCount: 0 }));
    });

    es.addEventListener('heartbeat', () => {
      setServerInfo((prev) => ({ ...prev, connected: true, streaming: true }));
    });

    es.addEventListener('shutdown', () => {
      setServerInfo((prev) => ({ ...prev, streaming: false }));
    });

    es.onopen = () => {
      setServerInfo((prev) => ({ ...prev, connected: true, streaming: true }));
      // (Re)connected: resync live agent rows (events missed while offline
      // are not replayed).
      syncAgentStatus();
      refreshServerInfo();
    };

    es.onerror = () => {
      setServerInfo((prev) => ({ ...prev, streaming: false }));
    };

    refreshServerInfo();
    const statusInterval = setInterval(refreshServerInfo, STATUS_POLL_MS);

    return () => {
      es.close();
      clearInterval(statusInterval);
    };
  }, [refreshServerInfo, removeAgentStatus, syncAgentStatus, upsertAgentStatus]);

  const loadMore = useCallback(async () => {
    if (loadingRef.current || !hasMore) return;
    const oldest = notifications[notifications.length - 1];
    if (!oldest) return;
    if (
      serverInfo.notificationsCount > 0 &&
      notifications.length >= serverInfo.notificationsCount
    ) {
      setHasMore(false);
      return;
    }

    loadingRef.current = true;
    setLoadingMore(true);
    try {
      const params = new URLSearchParams({ limit: String(PAGE_SIZE), before: oldest.id });
      const res = await fetch(`/api/notifications?${params.toString()}`);
      if (!res.ok) throw new Error(`Failed to load older notifications: ${res.status}`);
      const page = parseNotificationList(await res.json());
      setNotifications((prev) => {
        const seen = new Set(prev.map((n) => n.id));
        const merged = [...prev];
        for (const item of page) {
          if (!seen.has(item.id)) {
            seen.add(item.id);
            merged.push(item);
          }
        }
        return merged;
      });
      // A short page means we've reached the end of history.
      if (page.length < PAGE_SIZE) setHasMore(false);
    } catch {
      // Keep hasMore so the user can retry.
    } finally {
      loadingRef.current = false;
      setLoadingMore(false);
    }
  }, [hasMore, notifications, serverInfo.notificationsCount]);

  const handleDelete = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/notifications?id=${encodeURIComponent(id)}`, {
        method: 'DELETE',
      });
      // 404 means it was already gone; both outcomes match local state.
      if (res.ok || res.status === 404) {
        setNotifications((prev) => prev.filter((n) => n.id !== id));
        setServerInfo((prev) => ({
          ...prev,
          notificationsCount: Math.max(0, prev.notificationsCount - 1),
        }));
      } else {
        await refreshServerInfo();
      }
    } catch {
      await refreshServerInfo();
    }
  }, [refreshServerInfo]);

  const handleClearAll = useCallback(async () => {
    try {
      const res = await fetch('/api/notifications', { method: 'DELETE' });
      if (res.ok) {
        setNotifications([]);
        setHasMore(false);
        setServerInfo((prev) => ({ ...prev, notificationsCount: 0 }));
      }
    } catch {
      // Leave the list intact; the next SSE clear event can still win.
    }
  }, []);

  return {
    notifications,
    agentStatus,
    serverInfo,
    hasMore,
    loadingMore,
    liveEventSeq,
    handleDelete,
    handleClearAll,
    loadMore,
    lockedCount: notifications.filter((n) => n.locked).length,
  };
}
