import { testRender } from "@opentui/react/test-utils"
import { rgbToHex } from "@opentui/core"
import { it, expect, afterEach } from "bun:test"
import { NotificationRow, getHostModelTagColor } from "../components/NotificationRow"
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

it("renders relative timestamp", async () => {
  const now = new Date("2026-07-05T10:35:00.000Z")
  const { captureCharFrame, renderer, renderOnce } = await testRender(
    <NotificationRow item={mockItem} now={now} />,
    { width: 80, height: 8 },
  )
  await renderOnce()

  const frame = captureCharFrame()
  expect(frame).toContain("5m ago")

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

it("renders host_model tag with avatar-derived bg color", async () => {
  const hostModel = "gpt-4"
  const hostItem: NotificationItem = {
    id: "notif-4",
    data: { message: "test", pwd: "/proj", host_model: hostModel },
    timestamp: "2026-07-05T10:30:00.000Z",
  }
  const { captureCharFrame, captureSpans, renderer, renderOnce } = await testRender(
    <NotificationRow item={hostItem} />,
    { width: 80, height: 8 },
  )
  await renderOnce()

  const frame = captureCharFrame()
  expect(frame).toContain("gpt-4")

  const spans = captureSpans()
  const hostSpan = spans.lines.flatMap(l => l.spans).find(s => s.text.includes("gpt-4"))
  expect(hostSpan).toBeDefined()
  expect(rgbToHex(hostSpan!.bg).toLowerCase()).toBe(getHostModelTagColor(hostModel, "#000000").toLowerCase())

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
