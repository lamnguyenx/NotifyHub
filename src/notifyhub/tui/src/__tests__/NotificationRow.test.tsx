import { testRender } from "@opentui/react/test-utils"
import { rgbToHex } from "@opentui/core"
import { it, expect, afterEach } from "bun:test"
import { NotificationRow } from "../components/NotificationRow"
import type { NotificationItem } from "../types"

const mockItem: NotificationItem = {
  id: "notif-1",
  data: {
    message: "Build passed\nAll checks green",
    pwd: "/home/admin/project",
  },
  timestamp: "2026-07-05T10:30:00.000Z",
}

afterEach(() => {})

it("renders the message text", async () => {
  const { captureCharFrame, renderer, renderOnce } = await testRender(
    <NotificationRow item={mockItem} />,
    { width: 80, height: 8 },
  )
  await renderOnce()

  const frame = captureCharFrame()
  expect(frame).toContain("Build passed")
  expect(frame).toContain("All checks green")

  renderer.destroy()
})

it("renders avatar initial from pwd title", async () => {
  const { captureCharFrame, renderer, renderOnce } = await testRender(
    <NotificationRow item={mockItem} selected={false} />,
    { width: 80, height: 8 },
  )
  await renderOnce()

  const frame = captureCharFrame()
  expect(frame).toContain("P")

  renderer.destroy()
})

it("renders title from pwd", async () => {
  const { captureCharFrame, renderer, renderOnce } = await testRender(
    <NotificationRow item={mockItem} />,
    { width: 80, height: 8 },
  )
  await renderOnce()

  const frame = captureCharFrame()
  expect(frame).toContain("project")

  renderer.destroy()
})

it("renders pwd path below title", async () => {
  const { captureCharFrame, renderer, renderOnce } = await testRender(
    <NotificationRow item={mockItem} />,
    { width: 80, height: 8 },
  )
  await renderOnce()

  const frame = captureCharFrame()
  expect(frame).toContain("/home/admin/project")

  renderer.destroy()
})

it("renders formatted timestamp", async () => {
  const { captureCharFrame, renderer, renderOnce } = await testRender(
    <NotificationRow item={mockItem} />,
    { width: 80, height: 8 },
  )
  await renderOnce()

  const frame = captureCharFrame()
  expect(frame).toMatch(/\d{1,2}:\d{2}/)

  renderer.destroy()
})

it("renders rounded border characters", async () => {
  const { captureCharFrame, renderer, renderOnce } = await testRender(
    <NotificationRow item={mockItem} />,
    { width: 80, height: 8 },
  )
  await renderOnce()

  const frame = captureCharFrame()
  expect(frame).toContain("╭")
  expect(frame).toContain("╰")

  renderer.destroy()
})

it("shows default avatar N when pwd is empty", async () => {
  const noPwdItem: NotificationItem = {
    id: "notif-2",
    data: { message: "test" },
    timestamp: "2026-07-05T10:30:00.000Z",
  }
  const { captureCharFrame, renderer, renderOnce } = await testRender(
    <NotificationRow item={noPwdItem} />,
    { width: 80, height: 8 },
  )
  await renderOnce()

  const frame = captureCharFrame()
  expect(frame).toContain("N")

  renderer.destroy()
})

it("renders tag segments with cyan color", async () => {
  const tagItem: NotificationItem = {
    id: "notif-3",
    data: { message: "hello [#tag:info] world", pwd: "/test" },
    timestamp: "2026-07-05T10:30:00.000Z",
  }
  const { captureCharFrame, captureSpans, renderer, renderOnce } = await testRender(
    <NotificationRow item={tagItem} />,
    { width: 80, height: 8 },
  )
  await renderOnce()

  const frame = captureCharFrame()
  expect(frame).toContain("info")

  const spans = captureSpans()
  const tagSpan = spans.lines.flatMap(l => l.spans).find(s => s.text.includes("info"))
  expect(tagSpan).toBeDefined()
  expect(rgbToHex(tagSpan!.fg).toLowerCase()).toBe("#6fc3df")

  renderer.destroy()
})
