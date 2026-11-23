import { testRender } from "@opentui/react/test-utils"
import { rgbToHex } from "@opentui/core"
import { MouseButtons, type MockMouse } from "@opentui/core/testing"
import { expect, it } from "bun:test"
import { act, useState } from "react"
import { AppView } from "../App"
import { DARK_THEME } from "../theme"
import type { AgentStatusEntry, NotificationItem } from "../types"

const NOW = new Date()

function waiting(overrides: Partial<AgentStatusEntry> = {}): AgentStatusEntry {
  return {
    agent: "opencode",
    session_id: "ses_dock",
    state: "running",
    pwd: "/home/user/docked-project",
    host: "wsk",
    task: "docked work",
    since: new Date(NOW.getTime() - 60_000).toISOString(),
    updated: NOW.toISOString(),
    ...overrides,
  }
}

function note(id: string, message: string): NotificationItem {
  return { id, data: { message }, timestamp: NOW.toISOString() }
}

interface Calls {
  deleted: string[]
  dismissed: string[]
}

function Harness({
  initialStatus,
  initialNotifications,
  calls,
  hasMore = false,
  loadMore,
}: {
  initialStatus: AgentStatusEntry[]
  initialNotifications: NotificationItem[]
  calls: Calls
  hasMore?: boolean
  loadMore?: () => void
}) {
  const [status, setStatus] = useState(initialStatus)
  const [items, setItems] = useState(initialNotifications)

  return (
    <AppView
      notifications={items}
      agentStatus={status}
      serverInfo={{
        connected: true,
        streaming: true,
        notificationsCount: items.length,
        port: 9080,
        host: "localhost",
      }}
      hasMore={hasMore}
      loadMore={loadMore}
      handleDelete={(id) => {
        calls.deleted.push(id)
        setItems((prev) => prev.filter((n) => n.id !== id))
      }}
      handleDismissAgentStatus={(sessionId) => {
        calls.dismissed.push(sessionId)
        setStatus((prev) => prev.filter((e) => e.session_id !== sessionId))
      }}
      now={NOW}
    />
  )
}

async function render(
  initialStatus: AgentStatusEntry[],
  initialNotifications: NotificationItem[],
  options: { calls?: Calls; hasMore?: boolean; loadMore?: () => void; height?: number } = {},
) {
  const calls = options.calls ?? { deleted: [], dismissed: [] }
  const result = await testRender(
    <Harness
      initialStatus={initialStatus}
      initialNotifications={initialNotifications}
      calls={calls}
      hasMore={options.hasMore}
      loadMore={options.loadMore}
    />,
    { width: 90, height: options.height ?? 32 },
  )
  await act(async () => { await result.renderOnce() })
  return { ...result, calls }
}

async function press(
  key: string,
  mockInput: { pressKey: (k: string) => void },
  renderOnce: () => Promise<void>,
) {
  mockInput.pressKey(key)
  await act(async () => { await renderOnce() })
  await act(async () => { await renderOnce() })
}

async function pressEscape(
  mockInput: { pressKey: (k: string) => void },
  renderOnce: () => Promise<void>,
) {
  mockInput.pressKey("ESCAPE")
  // A lone Esc waits for the input parser's 20 ms escape-sequence timeout.
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 30))
    await renderOnce()
  })
  await act(async () => { await renderOnce() })
}

async function click(
  mockMouse: MockMouse,
  x: number,
  y: number,
  button: (typeof MouseButtons)[keyof typeof MouseButtons],
  renderOnce: () => Promise<void>,
) {
  await act(async () => {
    await mockMouse.click(x, y, button)
    await renderOnce()
  })
  await act(async () => { await renderOnce() })
}

it("dismisses a docked waiting card when Delete is pressed on it", async () => {
  const { captureCharFrame, mockInput, renderOnce, renderer, calls } = await render(
    [waiting()],
    [note("n1", "feed one"), note("n2", "feed two")],
  )

  expect(captureCharFrame()).toContain("docked work")
  await press("v", mockInput, renderOnce)
  await press("j", mockInput, renderOnce)
  await press("DELETE", mockInput, renderOnce)

  expect(calls.dismissed).toEqual(["ses_dock"])
  expect(calls.deleted).toEqual([])
  const frame = captureCharFrame()
  expect(frame).not.toContain("docked work")
  expect(frame).toContain("feed one")
  renderer.destroy()
})

it("keeps the selection on the next card after a docked card is dismissed", async () => {
  const { captureCharFrame, mockInput, renderOnce, renderer, calls } = await render(
    [waiting()],
    [note("n1", "feed one"), note("n2", "feed two")],
  )

  await press("v", mockInput, renderOnce)
  await press("j", mockInput, renderOnce)
  await press("DELETE", mockInput, renderOnce)
  await press("DELETE", mockInput, renderOnce)

  expect(calls.dismissed).toEqual(["ses_dock"])
  expect(calls.deleted).toEqual(["n1"])
  const frame = captureCharFrame()
  expect(frame).not.toContain("feed one")
  expect(frame).toContain("feed two")
  renderer.destroy()
})

it("dismisses a docked card with Backspace", async () => {
  const { mockInput, renderOnce, renderer, calls } = await render([waiting()], [])
  await press("v", mockInput, renderOnce)
  await press("j", mockInput, renderOnce)
  await press("BACKSPACE", mockInput, renderOnce)
  expect(calls.dismissed).toEqual(["ses_dock"])
  renderer.destroy()
})

it("does not delete anything before a card is selected", async () => {
  const { mockInput, renderOnce, renderer, calls } = await render(
    [waiting()],
    [note("n1", "feed one")],
  )
  await press("v", mockInput, renderOnce)
  await press("DELETE", mockInput, renderOnce)
  expect(calls.dismissed).toEqual([])
  expect(calls.deleted).toEqual([])
  renderer.destroy()
})

it("Escape clears the selection so Delete is a no-op", async () => {
  const { mockInput, renderOnce, renderer, calls } = await render([waiting()], [])
  await press("v", mockInput, renderOnce)
  await press("j", mockInput, renderOnce)
  await pressEscape(mockInput, renderOnce)
  await press("DELETE", mockInput, renderOnce)
  expect(calls.dismissed).toEqual([])
  renderer.destroy()
})

it("End selects the last notification and Home returns to the first docked card", async () => {
  const { mockInput, renderOnce, renderer, calls } = await render(
    [waiting()],
    [note("n1", "feed one"), note("n2", "feed two")],
  )

  await press("v", mockInput, renderOnce)
  await press("END", mockInput, renderOnce)
  await press("DELETE", mockInput, renderOnce)
  expect(calls.deleted).toEqual(["n2"])

  await press("HOME", mockInput, renderOnce)
  await press("DELETE", mockInput, renderOnce)
  expect(calls.dismissed).toEqual(["ses_dock"])
  renderer.destroy()
})

it("navigates past the last notification to load an older page", async () => {
  let loads = 0
  const { mockInput, renderOnce, renderer } = await render(
    [waiting()],
    [note("n1", "feed one"), note("n2", "feed two")],
    { hasMore: true, loadMore: () => { loads++ } },
  )

  await press("v", mockInput, renderOnce)
  // dock -> n1 -> n2 -> past the end
  await press("j", mockInput, renderOnce)
  await press("j", mockInput, renderOnce)
  await press("j", mockInput, renderOnce)
  await press("j", mockInput, renderOnce)
  expect(loads).toBe(1)
  renderer.destroy()
})

it("loads an older page with l when hasMore", async () => {
  let loads = 0
  const { mockInput, renderOnce, renderer } = await render([], [], {
    hasMore: true,
    loadMore: () => { loads++ },
  })
  await press("l", mockInput, renderOnce)
  expect(loads).toBe(1)
  renderer.destroy()
})

it("highlights the selected docked card", async () => {
  const { captureSpans, mockInput, renderOnce, renderer } = await render([waiting()], [])
  await press("v", mockInput, renderOnce)
  await press("j", mockInput, renderOnce)

  const spans = captureSpans().lines.flatMap((line) => line.spans)
  const taskSpan = spans.find((span) => span.text.includes("docked work"))
  expect(taskSpan).toBeDefined()
  expect(rgbToHex(taskSpan!.bg).toLowerCase()).toBe(DARK_THEME.surfaceSelected.toLowerCase())
  renderer.destroy()
})

it("hides idle sessions from the selection order", async () => {
  const { mockInput, renderOnce, renderer, calls } = await render(
    [waiting({ state: "idle", task: "idle work" })],
    [note("n1", "feed one")],
  )
  await press("v", mockInput, renderOnce)
  await press("j", mockInput, renderOnce)
  await press("DELETE", mockInput, renderOnce)
  expect(calls.dismissed).toEqual([])
  expect(calls.deleted).toEqual(["n1"])
  renderer.destroy()
})

it("opens a context menu on right-click instead of deleting immediately", async () => {
  const { captureCharFrame, mockMouse, renderOnce, renderer, calls } = await render(
    [waiting()],
    [note("n1", "feed one")],
  )

  // Row 1 is the waiting card's header; the event bubbles to the card box.
  await click(mockMouse, 5, 1, MouseButtons.RIGHT, renderOnce)

  expect(calls.dismissed).toEqual([])
  expect(calls.deleted).toEqual([])
  const frame = captureCharFrame()
  expect(frame).toContain("Waiting card")
  expect(frame).toContain("Select card")
  expect(frame).toContain("Copy task")
  expect(frame).toContain("Dismiss card")
  renderer.destroy()
})

it("dismisses a docked card from the context menu with the keyboard", async () => {
  const { captureCharFrame, mockMouse, mockInput, renderOnce, renderer, calls } = await render(
    [waiting()],
    [note("n1", "feed one")],
  )

  await click(mockMouse, 5, 1, MouseButtons.RIGHT, renderOnce)
  expect(calls.dismissed).toEqual([])

  // Up wraps from "Select card" to the destructive last item.
  await press("k", mockInput, renderOnce)
  await press("RETURN", mockInput, renderOnce)

  expect(calls.dismissed).toEqual(["ses_dock"])
  expect(calls.deleted).toEqual([])
  const frame = captureCharFrame()
  expect(frame).not.toContain("docked work")
  expect(frame).not.toContain("Waiting card")
  renderer.destroy()
})

it("deletes a feed notification from the context menu with the mouse", async () => {
  const { captureCharFrame, mockMouse, renderOnce, renderer, calls } = await render(
    [],
    [note("n1", "feed one"), note("n2", "feed two")],
  )

  // No dock: the first feed card starts at the top of the scrollbox.
  await click(mockMouse, 5, 1, MouseButtons.RIGHT, renderOnce)
  const menuFrame = captureCharFrame()
  expect(menuFrame).toContain("Notification")
  expect(menuFrame).toContain("Copy message")
  expect(menuFrame).toContain("Delete notification")
  expect(calls.deleted).toEqual([])

  // Menu top is row 1: title at row 2, Select at 3, Copy at 4, Delete at 5.
  await click(mockMouse, 7, 5, MouseButtons.LEFT, renderOnce)

  expect(calls.deleted).toEqual(["n1"])
  expect(calls.dismissed).toEqual([])
  const frame = captureCharFrame()
  expect(frame).not.toContain("feed one")
  expect(frame).toContain("feed two")
  renderer.destroy()
})

it("copies the message from the context menu", async () => {
  const { captureCharFrame, mockMouse, mockInput, renderOnce, renderer } = await render(
    [],
    [note("n1", "[#tag:@USER] copy me")],
  )
  const copied: string[] = []
  renderer.copyToClipboardOSC52 = (text: string) => {
    copied.push(text)
    return true
  }

  await click(mockMouse, 5, 1, MouseButtons.RIGHT, renderOnce)
  await press("j", mockInput, renderOnce)
  await press("RETURN", mockInput, renderOnce)

  // Markers are stripped so the clipboard gets readable text.
  expect(copied).toEqual(["@USER copy me"])
  expect(captureCharFrame()).toContain("Message copied")
  renderer.destroy()
})

it("closes the context menu on Escape without running an action", async () => {
  const { captureCharFrame, mockMouse, mockInput, renderOnce, renderer, calls } = await render(
    [waiting()],
    [note("n1", "feed one")],
  )

  await click(mockMouse, 5, 1, MouseButtons.RIGHT, renderOnce)
  expect(captureCharFrame()).toContain("Waiting card")

  await pressEscape(mockInput, renderOnce)
  const frame = captureCharFrame()
  expect(frame).not.toContain("Waiting card")
  expect(calls.dismissed).toEqual([])
  expect(calls.deleted).toEqual([])
  renderer.destroy()
})

it("does not delete on left-click", async () => {
  const { mockMouse, renderOnce, renderer, calls } = await render(
    [waiting()],
    [note("n1", "feed one")],
  )
  await click(mockMouse, 5, 1, MouseButtons.LEFT, renderOnce)
  expect(calls.dismissed).toEqual([])
  expect(calls.deleted).toEqual([])
  renderer.destroy()
})
