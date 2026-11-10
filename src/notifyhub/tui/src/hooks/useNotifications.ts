import { useEffect, useRef, useState, useCallback } from "react"
import type { AgentStatusEntry, NotificationItem, ServerInfo } from "../types"
import {
  fetchAgentStatus,
  fetchNotifications,
  connectSSE,
  deleteNotification,
  checkServerStatus,
  PAGE_SIZE,
} from "../utils/api"
import { decryptItem, decryptItems, isEnvelope, decryptEnvelope, ensureKey } from "../utils/crypto"

export function safeParse<T>(json: string, fallback: T): T {
  try {
    return JSON.parse(json) as T
  } catch {
    return fallback
  }
}

/** Decrypt one SSE agent_status payload (an entry or its e2e envelope). */
async function decryptStatusEntry(raw: unknown): Promise<AgentStatusEntry | null> {
  if (isEnvelope(raw)) {
    const key = await ensureKey()
    if (!key) return null
    try {
      raw = await decryptEnvelope(raw, key)
    } catch {
      return null
    }
  }
  if (typeof raw !== "object" || raw === null) return null
  const v = raw as Record<string, unknown>
  if (typeof v.agent !== "string" || typeof v.session_id !== "string" || typeof v.state !== "string") {
    return null
  }
  return raw as AgentStatusEntry
}

export function useNotifications() {
  const [notifications, setNotifications] = useState<NotificationItem[]>([])
  const [hasMore, setHasMore] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const loadingRef = useRef(false)
  const [serverInfo, setServerInfo] = useState<ServerInfo>({
    connected: false,
    streaming: false,
    notificationsCount: 0,
    port: 9080,
    host: "localhost",
  })

  const [agentStatus, setAgentStatus] = useState<AgentStatusEntry[]>([])

  const upsertAgentStatus = useCallback((entry: AgentStatusEntry) => {
    setAgentStatus((prev) => {
      const next = prev.filter((e) => e.session_id !== entry.session_id)
      next.unshift(entry)
      return next
    })
  }, [])

  const removeAgentStatus = useCallback((sessionId: string) => {
    setAgentStatus((prev) => prev.filter((e) => e.session_id !== sessionId))
  }, [])

  // Status poll: only fetches the count, never the full list.
  const refresh = useCallback(async () => {
    const info = await checkServerStatus()
    setServerInfo((prev) => ({ ...prev, ...info }))
  }, [])

  useEffect(() => {
    const disconnect = connectSSE(
      async (event, data) => {
        switch (event) {
          case "init": {
            // Server sends at most PAGE_SIZE items; older history is lazy-loaded.
            const items = safeParse<NotificationItem[]>(data, [])
            decryptItems(items).then((decrypted) => {
              setNotifications(decrypted)
              setHasMore(decrypted.length >= PAGE_SIZE)
            })
            setServerInfo((prev) => ({
              ...prev,
              connected: true,
              streaming: true,
            }))
            break
          }
          case "notification": {
            const item = safeParse<NotificationItem | null>(data, null)
            if (item) {
              decryptItem(item).then((decrypted) => {
                setNotifications((prev) => {
                  if (prev.some((n) => n.id === decrypted.id)) return prev
                  return [decrypted, ...prev]
                })
                // A completion notification resolves the live row for the
                // same session (both reporters stamp data.session_id).
                const sid =
                  !decrypted.locked &&
                  typeof (decrypted.data as Record<string, unknown>)?.session_id === "string"
                    ? ((decrypted.data as Record<string, unknown>).session_id as string)
                    : null
                if (sid) removeAgentStatus(sid)
              })
              setServerInfo((prev) => ({
                ...prev,
                connected: true,
                streaming: true,
                notificationsCount: prev.notificationsCount + 1,
              }))
            }
            break
          }
          case "agent_status": {
            const entry = await decryptStatusEntry(safeParse<unknown>(data, null))
            if (entry) upsertAgentStatus(entry)
            break
          }
          case "delete": {
            const parsed = safeParse<{ id: string }>(data, { id: "" })
            if (parsed.id) {
              setNotifications((prev) => prev.filter((n) => n.id !== parsed.id))
              setServerInfo((prev) => ({
                ...prev,
                notificationsCount: Math.max(0, prev.notificationsCount - 1),
              }))
            }
            break
          }
          case "clear": {
            setNotifications([])
            setHasMore(false)
            setServerInfo((prev) => ({ ...prev, notificationsCount: 0 }))
            break
          }
          case "heartbeat":
            setServerInfo((prev) => ({ ...prev, connected: true, streaming: true }))
            break
          case "shutdown":
            setServerInfo((prev) => ({ ...prev, connected: false }))
            break
        }
      },
      (streaming) => {
        setServerInfo((prev) => ({ ...prev, streaming }))
        // (Re)connected: resync live agent rows (events missed while offline
        // are not replayed).
        if (streaming) {
          fetchAgentStatus()
            .then((entries) => setAgentStatus(entries))
            .catch(() => {})
        }
      },
      PAGE_SIZE,
    )

    refresh()
    const statusInterval = setInterval(refresh, 15_000)

    return () => {
      disconnect()
      clearInterval(statusInterval)
    }
  }, [refresh])

  const loadMore = useCallback(async () => {
    if (loadingRef.current) return

    const oldest = notifications[notifications.length - 1]
    if (!oldest) return
    if (serverInfo.notificationsCount > 0 && notifications.length >= serverInfo.notificationsCount) {
      setHasMore(false)
      return
    }

    loadingRef.current = true
    setLoadingMore(true)
    try {
      const rawPage = await fetchNotifications({ limit: PAGE_SIZE, before: oldest.id })
      const page = await decryptItems(rawPage)
      setNotifications((prev) => {
        const seen = new Set(prev.map((n) => n.id))
        const merged = [...prev]
        for (const item of page) {
          if (!seen.has(item.id)) {
            seen.add(item.id)
            merged.push(item)
          }
        }
        return merged
      })
      // A short page means we've reached the end of history.
      if (page.length < PAGE_SIZE) setHasMore(false)
    } catch {
      // Keep hasMore so the user can retry.
    } finally {
      loadingRef.current = false
      setLoadingMore(false)
    }
  }, [notifications, serverInfo.notificationsCount])

  const handleDelete = useCallback(async (id: string) => {
    await deleteNotification(id)
    setNotifications((prev) => prev.filter((n) => n.id !== id))
    setServerInfo((prev) => ({ ...prev, notificationsCount: Math.max(0, prev.notificationsCount - 1) }))
  }, [])

  return {
    notifications,
    agentStatus,
    serverInfo,
    hasMore,
    loadingMore,
    refresh,
    handleDelete,
    loadMore,
    lockedCount: notifications.filter((n) => n.locked).length,
  }
}
