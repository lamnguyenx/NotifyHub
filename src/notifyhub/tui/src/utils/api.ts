import type { AgentStatusEntry, E2EInfo, NotificationItem, ServerInfo } from "../types"
import { decryptEnvelope, ensureKey, isEnvelope } from "./crypto"

/** Mirror the CLI's scheme normalization (empty or "https://" → https/http). */
function normalizeScheme(raw: string | undefined): "http" | "https" {
  const value = (raw ?? "").trim().toLowerCase()
  if (!value) return "http"
  const head = value.includes("://") ? value.split("://", 1)[0]! : value
  return head.replace(/[:/]+$/, "") === "https" ? "https" : "http"
}

const DEFAULT_SCHEME = normalizeScheme(process.env.NOTIFYHUB_CLI_SCHEME)
const DEFAULT_HOST = process.env.NOTIFYHUB_CLI_HOST?.trim() || "localhost"
const DEFAULT_PORT = parseInt(process.env.NOTIFYHUB_CLI_PORT ?? "9080", 10) || 9080
const MAX_RECONNECT_DELAY = 30_000

const DEFAULT_PAGE_SIZE = 30

function parsePageSize(): number {
  const raw = process.env.NOTIFYHUB_TUI_PAGE_SIZE
  const n = raw ? parseInt(raw, 10) : NaN
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_PAGE_SIZE
}

// Number of notifications loaded per page (initial SSE `init` + lazy `loadMore`).
export const PAGE_SIZE = parsePageSize()

let _scheme = DEFAULT_SCHEME
let _host = DEFAULT_HOST
let _port = DEFAULT_PORT

/** Omit the scheme's default port (80/443), matching the CLI's address. */
export function buildApiBase(scheme: string, host: string, port: number): string {
  const defaultPort = scheme === "https" ? 443 : 80
  const portPart = port === defaultPort ? "" : `:${port}`
  return `${scheme}://${host}${portPart}`
}

export function getApiBase(): string {
  return buildApiBase(_scheme, _host, _port)
}

export interface FetchNotificationsOptions {
  limit?: number
  offset?: number
  /** Stable cursor: fetch notifications strictly older than this id. */
  before?: string
}

export async function fetchNotifications(
  opts: FetchNotificationsOptions = {},
): Promise<NotificationItem[]> {
  const params = new URLSearchParams()
  if (opts.limit != null) params.set("limit", String(opts.limit))
  if (opts.offset != null) params.set("offset", String(opts.offset))
  if (opts.before != null) params.set("before", opts.before)
  const query = params.toString()
  const res = await fetch(`${getApiBase()}/api/notifications${query ? `?${query}` : ""}`)
  if (!res.ok) throw new Error(`Failed to fetch notifications: ${res.status}`)
  return res.json()
}

export async function fetchNotificationsCount(): Promise<number> {
  const res = await fetch(`${getApiBase()}/api/notifications/count`)
  if (!res.ok) throw new Error(`Failed to fetch notification count: ${res.status}`)
  const data = (await res.json()) as { count?: number }
  return typeof data.count === "number" ? data.count : 0
}

export async function fetchE2EStatus(): Promise<E2EInfo> {
  const res = await fetch(`${getApiBase()}/api/e2e`)
  if (!res.ok) throw new Error(`Failed to fetch e2e status: ${res.status}`)
  const data = (await res.json()) as E2EInfo
  return data
}

/**
 * Live agent statuses, decrypted. Entries arrive either plaintext or as one
 * e2e envelope per entry (same wrapping as notifications); undecryptable
 * entries are dropped — the live waiting cards are best-effort display state,
 * not data the user must recover.
 */
export async function fetchAgentStatus(): Promise<AgentStatusEntry[]> {
  const res = await fetch(`${getApiBase()}/api/status`)
  if (!res.ok) throw new Error(`Failed to fetch agent status: ${res.status}`)
  const data = (await res.json()) as { agents: unknown[] }
  const resolved = await Promise.all(
    data.agents.map(async (entry) => {
      if (!isEnvelope(entry)) return isStatusEntry(entry) ? entry : null
      const key = await ensureKey()
      if (!key) return null
      try {
        const plain = await decryptEnvelope(entry, key)
        return isStatusEntry(plain) ? plain : null
      } catch {
        return null
      }
    }),
  )
  return resolved.filter((e): e is AgentStatusEntry => e !== null)
}

export async function deleteNotification(id: string): Promise<void> {
  const res = await fetch(`${getApiBase()}/api/notifications?id=${encodeURIComponent(id)}`, {
    method: "DELETE",
  })
  if (!res.ok && res.status !== 404) throw new Error(`Failed to delete: ${res.status}`)
}

export async function checkServerStatus(): Promise<ServerInfo> {
  try {
    // Lightweight: only the count + e2e state, never the notification payload.
    const [countRes, e2eRes] = await Promise.allSettled([
      fetchNotificationsCount(),
      fetchE2EStatus(),
    ])
    if (countRes.status === "rejected") throw countRes.reason
    const e2e = e2eRes.status === "fulfilled" ? e2eRes.value : undefined
    return {
      connected: true,
      streaming: false,
      notificationsCount: countRes.value,
      port: _port,
      host: _host,
      e2e,
    }
  } catch {
    return { connected: false, streaming: false, notificationsCount: 0, port: _port, host: _host }
  }
}

export type SSEEventHandler = (event: string, data: string) => void

/** Structural check for a decrypted/plain status entry. */
function isStatusEntry(value: unknown): value is AgentStatusEntry {
  if (typeof value !== "object" || value === null) return false
  const v = value as Record<string, unknown>
  return typeof v.agent === "string" && typeof v.session_id === "string" && typeof v.state === "string"
}

/**
 * Parse complete SSE blocks and return the trailing incomplete block.
 *
 * Parsing must be block-based, not line-based: `event:` and `data:` can land
 * in different network chunks. A line-based parser that only returns the
 * unfinished *line* loses the event name (the 20 KB `init` payload always
 * spans chunks), so the next chunk was emitted under the wrong event name.
 */
export function parseSSEStream(buffer: string, onEvent: SSEEventHandler): string {
  // Normalize CRLF first; a preceding chunk may end with "\r" and the next
  // start with "\n", so this is done on the concatenated buffer each call.
  const blocks = buffer.replace(/\r\n/g, "\n").split("\n\n")
  const remainder = blocks.pop() ?? ""

  for (const block of blocks) {
    let currentEvent = ""
    let currentData = ""

    for (const line of block.split("\n")) {
      if (line.startsWith("event: ")) {
        currentEvent = line.slice(7)
      } else if (line.startsWith("data: ")) {
        currentData += (currentData ? "\n" : "") + line.slice(6)
      }
    }

    if (currentEvent && currentData) onEvent(currentEvent, currentData)
  }

  return remainder
}

export function connectSSE(
  onEvent: SSEEventHandler,
  onStatusChange?: (streaming: boolean) => void,
  limit?: number,
): () => void {
  let cancelled = false
  let reconnectDelay = 1_000

  async function connect(): Promise<void> {
    const query = limit != null ? `?limit=${limit}` : ""
    const res = await fetch(`${getApiBase()}/events${query}`)
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
