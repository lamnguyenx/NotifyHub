import { useEffect, useState, useCallback } from "react"
import type { NotificationItem, ServerInfo } from "../types"
import {
  fetchNotifications,
  connectSSE,
  deleteNotification,
  checkServerStatus,
} from "../utils/api"

function safeParse<T>(json: string, fallback: T): T {
  try {
    return JSON.parse(json) as T
  } catch {
    return fallback
  }
}

export function useNotifications() {
  const [notifications, setNotifications] = useState<NotificationItem[]>([])
  const [serverInfo, setServerInfo] = useState<ServerInfo>({
    connected: false,
    streaming: false,
    notificationsCount: 0,
    port: 9080,
    host: "localhost",
  })

  const refresh = useCallback(async () => {
    const info = await checkServerStatus()
    setServerInfo((prev) => ({ ...prev, ...info }))
    if (info.connected) {
      const notes = await fetchNotifications()
      setNotifications(notes)
    }
  }, [])

  useEffect(() => {
    const disconnect = connectSSE(
      (event, data) => {
        switch (event) {
          case "init": {
            const items = safeParse<NotificationItem[]>(data, [])
            setNotifications(items)
            setServerInfo((prev) => ({
              ...prev,
              connected: true,
              streaming: true,
              notificationsCount: items.length,
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
    )

    refresh()
    const statusInterval = setInterval(refresh, 15_000)

    return () => {
      disconnect()
      clearInterval(statusInterval)
    }
  }, [refresh])

  const handleDelete = useCallback(async (id: string) => {
    await deleteNotification(id)
    setNotifications((prev) => prev.filter((n) => n.id !== id))
    setServerInfo((prev) => ({ ...prev, notificationsCount: Math.max(0, prev.notificationsCount - 1) }))
  }, [])

  return { notifications, serverInfo, refresh, handleDelete }
}
