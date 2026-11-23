import { mock, expect, it, describe, beforeEach } from "bun:test"
import { act } from "react"
import { testRender } from "@opentui/react/test-utils"
import type { AgentStatusEntry, NotificationItem, ServerInfo } from "../types"

// Record every play() decision the SSE hook makes. The ding lives on the live
// `notification` event (not on feed-shape changes), pinned by these tests.
const playLog: string[] = []

mock.module("../hooks/useAudio", () => ({
  useNotificationSound: () => () => {
    playLog.push("play")
  },
  soundDebug: () => {},
}))

type SSEHandler = (event: string, data: string) => void
let sseEmit: SSEHandler | null = null
const statusChangeLog: boolean[] = []
let fetchAgentStatusResult: AgentStatusEntry[] = []

mock.module("../utils/api", () => ({
  PAGE_SIZE: 30,
  connectSSE: (onEvent: SSEHandler, onStatusChange?: (s: boolean) => void) => {
    sseEmit = onEvent
    if (onStatusChange) {
      statusChangeLog.push(true)
      onStatusChange(true)
    }
    return () => {}
  },
  fetchAgentStatus: async () => fetchAgentStatusResult,
  fetchNotifications: async () => [],
  fetchNotificationsCount: async () => 0,
  fetchE2EStatus: async () => ({ enabled: false }),
  deleteNotification: async () => {},
  checkServerStatus: async (): Promise<ServerInfo> => ({
    connected: true,
    streaming: true,
    notificationsCount: 0,
    port: 9080,
    host: "localhost",
  }),
}))

const { useNotifications } = await import("../hooks/useNotifications")

type NotificationsState = ReturnType<typeof useNotifications>

function Probe({ probe }: { probe: { current: NotificationsState | null } }) {
  probe.current = useNotifications()
  return null
}

async function mount(): Promise<{ state: () => NotificationsState; renderOnce: () => Promise<void> }> {
  const probe: { current: NotificationsState | null } = { current: null }
  const result = await testRender(<Probe probe={probe} />, { width: 80, height: 24 })
  await act(async () => {
    await result.renderOnce()
  })
  await act(async () => {})
  return { state: () => probe.current!, renderOnce: result.renderOnce }
}

function note(id: string, message: string, sessionId?: string): NotificationItem {
  return {
    id,
    data: sessionId ? { message, session_id: sessionId, pwd: "/srv/project" } : { message },
    timestamp: new Date().toISOString(),
  }
}

function sse(item: NotificationItem) {
  sseEmit?.("notification", JSON.stringify(item))
}

function sseStatus(entry: Partial<AgentStatusEntry>) {
  sseEmit?.(
    "agent_status",
    JSON.stringify({
      agent: "opencode",
      session_id: "ses_x",
      state: "running",
      pwd: "/srv/project",
      host: "MS-7E70",
      task: "work",
      since: new Date().toISOString(),
      updated: new Date().toISOString(),
      ...entry,
    }),
  )
}

async function flush(renderOnce: () => Promise<void>) {
  // Two rounds: one for the decrypt promise, one for the state commit.
  await act(async () => {
    await renderOnce()
  })
  await act(async () => {})
}

beforeEach(() => {
  playLog.length = 0
  statusChangeLog.length = 0
  sseEmit = null
  fetchAgentStatusResult = []
})

describe("notification sound trigger (SSE event based)", () => {
  it("plays for a live arrival even when the feed is empty (cleared cards, fresh backend)", async () => {
    const { state, renderOnce } = await mount()
    sseEmit?.("init", "[]")
    await flush(renderOnce)

    sse(note("n1", "hello"))
    await flush(renderOnce)

    expect(playLog).toEqual(["play"])
    expect(state().notifications.map((n) => n.id)).toEqual(["n1"])
  })

  it("stays silent for the init history page", async () => {
    const { renderOnce } = await mount()
    sseEmit?.("init", JSON.stringify([note("a", "old"), note("b", "older")]))
    await flush(renderOnce)
    expect(playLog).toEqual([])
  })

  it("plays exactly once for a completion that also resolves its waiting card", async () => {
    const { state, renderOnce } = await mount()
    sseEmit?.("init", JSON.stringify([note("a", "old")]))
    await flush(renderOnce)

    sseStatus({ session_id: "ses_done" })
    await flush(renderOnce)
    expect(state().agentStatus.map((e) => e.session_id)).toEqual(["ses_done"])

    sse(note("c1", "[#tag:@USER] completion", "ses_done"))
    await flush(renderOnce)

    expect(playLog).toEqual(["play"])
    expect(state().notifications[0]?.id).toBe("c1")
    // The docked card for the finished session is gone.
    expect(state().agentStatus).toEqual([])
  })

  it("does not play again for a duplicate SSE delivery of the same id", async () => {
    const { state, renderOnce } = await mount()
    sseEmit?.("init", JSON.stringify([note("a", "old")]))
    await flush(renderOnce)

    const item = note("n1", "once")
    sse(item)
    await flush(renderOnce)
    sse(item)
    await flush(renderOnce)

    expect(playLog).toEqual(["play"])
    expect(state().notifications.filter((n) => n.id === "n1").length).toBe(1)
  })

  it("stays silent for delete and clear events", async () => {
    const { renderOnce } = await mount()
    sseEmit?.("init", JSON.stringify([note("a", "old")]))
    await flush(renderOnce)

    sseEmit?.("delete", JSON.stringify({ id: "a" }))
    await flush(renderOnce)
    sseEmit?.("clear", "{}")
    await flush(renderOnce)

    expect(playLog).toEqual([])
  })

  it("plays for an arrival after local deletions emptied the feed", async () => {
    const { state, renderOnce } = await mount()
    sseEmit?.("init", JSON.stringify([note("a", "old")]))
    await flush(renderOnce)

    await act(async () => {
      await state().handleDelete("a")
    })
    await flush(renderOnce)
    expect(state().notifications).toEqual([])

    sse(note("n1", "completion after cleanup"))
    await flush(renderOnce)

    expect(playLog).toEqual(["play"])
  })
})
