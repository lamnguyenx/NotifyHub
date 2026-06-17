import type { NotificationItem, ServerInfo } from "../types"

const DEFAULT_HOST = "localhost"
const DEFAULT_PORT = 9080

let _host = DEFAULT_HOST
let _port = DEFAULT_PORT

export function configureApi(host: string, port: number) {
  _host = host
  _port = port
}

export function getApiBase(): string {
  return `http://${_host}:${_port}`
}

export async function fetchNotifications(): Promise<NotificationItem[]> {
  const res = await fetch(`${getApiBase()}/api/notifications`)
  if (!res.ok) throw new Error(`Failed to fetch notifications: ${res.status}`)
  return res.json()
}

export async function deleteNotification(id: string): Promise<void> {
  const res = await fetch(`${getApiBase()}/api/notifications?id=${encodeURIComponent(id)}`, {
    method: "DELETE",
  })
  if (!res.ok && res.status !== 404) throw new Error(`Failed to delete: ${res.status}`)
}

export async function clearAllNotifications(): Promise<void> {
  const res = await fetch(`${getApiBase()}/api/notifications`, {
    method: "DELETE",
  })
  if (!res.ok) throw new Error(`Failed to clear: ${res.status}`)
}

export async function checkServerStatus(): Promise<ServerInfo> {
  try {
    const notes = await fetchNotifications()
    return {
      connected: true,
      notificationsCount: notes.length,
      port: _port,
      host: _host,
    }
  } catch {
    return { connected: false, notificationsCount: 0, port: _port, host: _host }
  }
}

export type SSEEventHandler = (event: string, data: string) => void

export function connectSSE(onEvent: SSEEventHandler, onError?: (err: Error) => void): () => void {
  let cancelled = false

  async function run() {
    try {
      const res = await fetch(`${getApiBase()}/events`)
      if (!res.ok || !res.body) {
        onError?.(new Error(`SSE connection failed: ${res.status}`))
        return
      }

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ""

      while (!cancelled) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split("\n")
        buffer = lines.pop() ?? ""

        let currentEvent = ""
        let currentData = ""

        for (const raw of lines) {
          const line = raw.trimEnd()
          if (line.startsWith("event: ")) {
            currentEvent = line.slice(7)
          } else if (line.startsWith("data: ")) {
            currentData = line.slice(6)
          } else if (line.length === 0 && currentEvent && currentData) {
            onEvent(currentEvent, currentData)
            currentEvent = ""
            currentData = ""
          }
        }
      }

      reader.releaseLock()
    } catch (err) {
      if (!cancelled) onError?.(err instanceof Error ? err : new Error(String(err)))
    }
  }

  run()
  return () => { cancelled = true }
}
