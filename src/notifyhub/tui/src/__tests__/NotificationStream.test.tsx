import { testRender } from "@opentui/react/test-utils"
import { it, expect } from "bun:test"
import { act } from "react"
import { NotificationStream } from "../components/NotificationStream"
import type { NotificationItem } from "../types"

const mockItems: NotificationItem[] = [
  { id: "1", data: { message: "First notification" }, timestamp: "2026-07-05T10:00:00.000Z" },
  { id: "2", data: { message: "Second notification" }, timestamp: "2026-07-05T10:01:00.000Z" },
  { id: "3", data: { message: "Third notification" }, timestamp: "2026-07-05T10:02:00.000Z" },
]

async function render(
  items: NotificationItem[],
  props: { selectMode?: boolean; selectedId?: string | null } = {},
) {
  const result = await testRender(<NotificationStream notifications={items} {...props} />, {
    width: 80,
    height: 24,
  })
  await act(async () => { await result.renderOnce() })
  return result
}

it("shows waiting message when empty", async () => {
  const { captureCharFrame, renderer } = await render([])
  const frame = captureCharFrame()
  expect(frame).toContain("Waiting for notifications")
  renderer.destroy()
})

it("renders all notifications", async () => {
  const { captureCharFrame, renderer } = await render(mockItems)
  const frame = captureCharFrame()
  expect(frame).toContain("First notification")
  expect(frame).toContain("Second notification")
  expect(frame).toContain("Third notification")
  renderer.destroy()
})

it("shows select mode banner when selectMode is on", async () => {
  const { captureCharFrame, renderer } = await render(mockItems, { selectMode: true })
  const frame = captureCharFrame()
  expect(frame).toContain("SELECT MODE")
  expect(frame).toContain("Del: delete/dismiss")
  renderer.destroy()
})

it("hides select mode banner when selectMode is off", async () => {
  const { captureCharFrame, renderer } = await render(mockItems)
  expect(captureCharFrame()).not.toContain("SELECT MODE")
  renderer.destroy()
})

// A short viewport keeps the list off the bottom, so the auto-load interval
// doesn't fire and call counts stay deterministic.
async function renderWithLoadMore(onLoadMore: () => void, height = 8) {
  const result = await testRender(
    <NotificationStream notifications={mockItems} hasMore onLoadMore={onLoadMore} />,
    { width: 80, height },
  )
  await act(async () => { await result.renderOnce() })
  return result
}

it("shows load-older hint when hasMore", async () => {
  const { captureCharFrame, renderer } = await renderWithLoadMore(() => {}, 24)
  expect(captureCharFrame()).toContain("load older")
  renderer.destroy()
})

it("does not show load-older hint when fully loaded", async () => {
  const { captureCharFrame, renderer } = await render(mockItems)
  expect(captureCharFrame()).not.toContain("load older")
  renderer.destroy()
})
