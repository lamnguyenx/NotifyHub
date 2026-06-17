import { useEffect, useState, useCallback } from "react"
import type { NotificationItem, ServerInfo } from "../types"
import {
  fetchNotifications,
  connectSSE,
  deleteNotification,
  checkServerStatus,
} from "../utils/api"

export function useNotifications() {
  const [notifications, setNotifications] = useState<NotificationItem[]>([])
  const [serverInfo, setServerInfo] = useState<ServerInfo>({
    connected: false,
    notificationsCount: 0,
    port: 9080,
    host: "localhost",
  })

  const refresh = useCallback(async () => {
    const info = await checkServerStatus()
    setServerInfo(info)
    if (info.connected) {
      const notes = await fetchNotifications()
      setNotifications(notes)
    }
  }, [])

  useEffect(() => {
    const disconnect = connectSSE((event, data) => {
      switch (event) {
        case "init": {
          const items: NotificationItem[] = JSON.parse(data)
          setNotifications(items)
          setServerInfo((prev) => ({ ...prev, connected: true, notificationsCount: items.length }))
          break
        }
        case "notification": {
          const item: NotificationItem = JSON.parse(data)
          setNotifications((prev) => [item, ...prev])
          setServerInfo((prev) => ({ ...prev, connected: true, notificationsCount: prev.notificationsCount + 1 }))
          break
        }
        case "delete": {
          const { id } = JSON.parse(data)
          setNotifications((prev) => prev.filter((n) => n.id !== id))
          setServerInfo((prev) => ({ ...prev, notificationsCount: Math.max(0, prev.notificationsCount - 1) }))
          break
        }
        case "clear": {
          setNotifications([])
          setServerInfo((prev) => ({ ...prev, notificationsCount: 0 }))
          break
        }
        case "heartbeat":
          setServerInfo((prev) => ({ ...prev, connected: true }))
          break
        case "shutdown":
          setServerInfo((prev) => ({ ...prev, connected: false }))
          break
      }
    })

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
