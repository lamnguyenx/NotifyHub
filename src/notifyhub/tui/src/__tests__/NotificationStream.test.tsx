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

async function render(items: NotificationItem[], onDelete?: (id: string) => void) {
  const result = await testRender(
    <NotificationStream notifications={items} onDelete={onDelete ?? (() => {})} />,
    { width: 80, height: 24 },
  )
  await act(async () => { await result.renderOnce() })
  return result
}

async function press(key: string, mockInput: { pressKey: (k: string) => void }, renderOnce: () => Promise<void>) {
  mockInput.pressKey(key)
  await act(async () => { await renderOnce() })
  await act(async () => { await renderOnce() })
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

it("shows select mode banner on v press", async () => {
  const { captureCharFrame, mockInput, renderOnce, renderer } = await render(mockItems)
  await press("v", mockInput, renderOnce)
  const frame = captureCharFrame()
  expect(frame).toContain("SELECT MODE")
  renderer.destroy()
})

it("hides select mode banner on second v press", async () => {
  const { captureCharFrame, mockInput, renderOnce, renderer } = await render(mockItems)
  await press("v", mockInput, renderOnce)
  await press("v", mockInput, renderOnce)
  const frame = captureCharFrame()
  expect(frame).not.toContain("SELECT MODE")
  renderer.destroy()
})

it("moves selection down on j press", async () => {
  const { captureCharFrame, mockInput, renderOnce, renderer } = await render(mockItems)
  await press("v", mockInput, renderOnce)
  await press("j", mockInput, renderOnce)
  renderer.destroy()
})

it("moves selection down on arrow down", async () => {
  const { captureCharFrame, mockInput, renderOnce, renderer } = await render(mockItems)
  await press("v", mockInput, renderOnce)
  await press("ARROW_DOWN", mockInput, renderOnce)
  renderer.destroy()
})

it("moves selection up on k press", async () => {
  const { captureCharFrame, mockInput, renderOnce, renderer } = await render(mockItems)
  await press("v", mockInput, renderOnce)
  await press("j", mockInput, renderOnce)
  await press("k", mockInput, renderOnce)
  renderer.destroy()
})

it("calls onDelete on delete key", async () => {
  const deleted: string[] = []
  const { mockInput, renderOnce, renderer } = await render(mockItems, (id) => deleted.push(id))
  await press("v", mockInput, renderOnce)
  await press("j", mockInput, renderOnce)
  await press("DELETE", mockInput, renderOnce)
  expect(deleted).toEqual(["2"])
  renderer.destroy()
})

it("calls onDelete on backspace key", async () => {
  const deleted: string[] = []
  const { mockInput, renderOnce, renderer } = await render(mockItems, (id) => deleted.push(id))
  await press("v", mockInput, renderOnce)
  await press("j", mockInput, renderOnce)
  await press("BACKSPACE", mockInput, renderOnce)
  expect(deleted).toEqual(["2"])
  renderer.destroy()
})

it("deselects on escape", async () => {
  const { mockInput, renderOnce, renderer } = await render(mockItems)
  await press("v", mockInput, renderOnce)
  await press("j", mockInput, renderOnce)
  await press("ESCAPE", mockInput, renderOnce)
  renderer.destroy()
})

it("home goes to first item", async () => {
  const { mockInput, renderOnce, renderer } = await render(mockItems)
  await press("v", mockInput, renderOnce)
  await press("END", mockInput, renderOnce)
  await press("HOME", mockInput, renderOnce)
  renderer.destroy()
})

it("end goes to last item", async () => {
  const { mockInput, renderOnce, renderer } = await render(mockItems)
  await press("v", mockInput, renderOnce)
  await press("END", mockInput, renderOnce)
  renderer.destroy()
})
