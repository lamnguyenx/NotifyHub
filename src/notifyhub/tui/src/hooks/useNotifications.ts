import { useEffect, useRef, useState, useCallback } from "react"
import type { NotificationItem, ServerInfo } from "../types"
import {
  fetchNotifications,
  connectSSE,
  deleteNotification,
  checkServerStatus,
  PAGE_SIZE,
} from "../utils/api"

export function safeParse<T>(json: string, fallback: T): T {
  try {
    return JSON.parse(json) as T
  } catch {
    return fallback
  }
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

  // Status poll: only fetches the count, never the full list.
  const refresh = useCallback(async () => {
    const info = await checkServerStatus()
    setServerInfo((prev) => ({ ...prev, ...info }))
  }, [])

  useEffect(() => {
    const disconnect = connectSSE(
      (event, data) => {
        switch (event) {
          case "init": {
            // Server sends at most PAGE_SIZE items; older history is lazy-loaded.
            const items = safeParse<NotificationItem[]>(data, [])
            setNotifications(items)
            setHasMore(items.length >= PAGE_SIZE)
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
              setNotifications((prev) => [item, ...prev])
              setServerInfo((prev) => ({
                ...prev,
                connected: true,
                streaming: true,
                notificationsCount: prev.notificationsCount + 1,
              }))
            }
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
      const page = await fetchNotifications({ limit: PAGE_SIZE, before: oldest.id })
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

  return { notifications, serverInfo, hasMore, loadingMore, refresh, handleDelete, loadMore }
}
