import type { NotificationItem, ServerInfo } from "../types"

const DEFAULT_HOST = "localhost"
const DEFAULT_PORT = 9080
const MAX_RECONNECT_DELAY = 30_000

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

export async function checkServerStatus(): Promise<ServerInfo> {
  try {
    const notes = await fetchNotifications()
    return {
      connected: true,
      streaming: false,
      notificationsCount: notes.length,
      port: _port,
      host: _host,
    }
  } catch {
    return { connected: false, streaming: false, notificationsCount: 0, port: _port, host: _host }
  }
}

export type SSEEventHandler = (event: string, data: string) => void

function parseSSEStream(buffer: string, onEvent: SSEEventHandler): string {
  const lines = buffer.split("\n")
  const remainder = lines.pop() ?? ""

  let currentEvent = ""
  let currentData = ""

  for (const raw of lines) {
    const line = raw.trimEnd()
    if (line.startsWith("event: ")) {
      currentEvent = line.slice(7)
    } else if (line.startsWith("data: ")) {
      currentData += (currentData ? "\n" : "") + line.slice(6)
    } else if (line.length === 0 && currentEvent && currentData) {
      onEvent(currentEvent, currentData)
      currentEvent = ""
      currentData = ""
    }
  }

  return remainder
}

export function connectSSE(onEvent: SSEEventHandler, onStatusChange?: (streaming: boolean) => void): () => void {
  let cancelled = false
  let reconnectDelay = 1_000

  async function connect(): Promise<void> {
    const res = await fetch(`${getApiBase()}/events`)
    if (!res.ok || !res.body) {
      throw new Error(`SSE connection failed: ${res.status}`)
    }

    onStatusChange?.(true)

    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ""

    try {
      while (!cancelled) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        buffer = parseSSEStream(buffer, onEvent)
      }
    } finally {
      reader.releaseLock()
      onStatusChange?.(false)
    }
  }

  async function run() {
    while (!cancelled) {
      try {
        await connect()
        reconnectDelay = 1_000
      } catch {
        onStatusChange?.(false)
      }
      if (!cancelled) {
        await new Promise((r) => setTimeout(r, reconnectDelay))
        reconnectDelay = Math.min(reconnectDelay * 2, MAX_RECONNECT_DELAY)
      }
    }
  }

  run()
  return () => { cancelled = true }
}
