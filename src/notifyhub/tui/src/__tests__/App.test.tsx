import { testRender } from "@opentui/react/test-utils"
import { it, expect, beforeAll, afterAll } from "bun:test"
import { act } from "react"
import { App } from "../App"

const originalFetch = globalThis.fetch

beforeAll(() => {
  globalThis.fetch = async (url: RequestInfo | URL) => {
    const urlStr = typeof url === "string" ? url : url instanceof URL ? url.href : url.url
    if (urlStr.includes("/api/notifications")) {
      return new Response("[]", { status: 200, headers: { "Content-Type": "application/json" } })
    }
    if (urlStr.includes("/events")) {
      return new Response(null, { status: 200, headers: {} })
    }
    return new Response("", { status: 404 })
  }
})

afterAll(() => {
  globalThis.fetch = originalFetch
})

async function render() {
  const result = await testRender(<App />, { width: 80, height: 24 })
  await act(async () => { await result.renderOnce() })
  return result
}

async function press(key: string, mockInput: { pressKey: (k: string) => void }, renderOnce: () => Promise<void>) {
  mockInput.pressKey(key)
  await act(async () => { await renderOnce() })
  await act(async () => { await renderOnce() })
}

it("shows footer with key hints", async () => {
  const { captureCharFrame, renderer } = await render()
  const frame = captureCharFrame()
  expect(frame).toContain("v:select")
  expect(frame).toContain("q:quit")
  renderer.destroy()
})

it("shows waiting for notifications initially", async () => {
  const { captureCharFrame, renderer } = await render()
  const frame = captureCharFrame()
  expect(frame).toContain("Waiting for notifications")
  renderer.destroy()
})

it("does not show popups initially", async () => {
  const { captureCharFrame, renderer } = await render()
  const frame = captureCharFrame()
  expect(frame).not.toContain("Status")
  expect(frame).not.toContain("Help")
  renderer.destroy()
})

it("toggles status popup on s", async () => {
  const { captureCharFrame, mockInput, renderOnce, renderer } = await render()
  await press("s", mockInput, renderOnce)
  const frame = captureCharFrame()
  expect(frame).toContain("Status")
  renderer.destroy()
})

it("dismisses status popup on second s", async () => {
  const { captureCharFrame, mockInput, renderOnce, renderer } = await render()
  await press("s", mockInput, renderOnce)
  await press("s", mockInput, renderOnce)
  const frame = captureCharFrame()
  expect(frame).not.toContain("Status")
  renderer.destroy()
})

it("toggles help popup on h", async () => {
  const { captureCharFrame, mockInput, renderOnce, renderer } = await render()
  await press("h", mockInput, renderOnce)
  const frame = captureCharFrame()
  expect(frame).toContain("Help")
  renderer.destroy()
})

it("toggles help popup on ?", async () => {
  const { captureCharFrame, mockInput, renderOnce, renderer } = await render()
  await press("?", mockInput, renderOnce)
  const frame = captureCharFrame()
  expect(frame).toContain("Help")
  renderer.destroy()
})

it("status and help are mutually exclusive", async () => {
  const { captureCharFrame, mockInput, renderOnce, renderer } = await render()
  await press("s", mockInput, renderOnce)
  await press("h", mockInput, renderOnce)
  const frame = captureCharFrame()
  expect(frame).toContain("Help")
  expect(frame).not.toContain("Status")
  renderer.destroy()
})

it("any key dismisses open status popup", async () => {
  const { captureCharFrame, mockInput, renderOnce, renderer } = await render()
  await press("s", mockInput, renderOnce)
  await press("x", mockInput, renderOnce)
  const frame = captureCharFrame()
  expect(frame).not.toContain("Status")
  renderer.destroy()
})

it("any key dismisses open help popup", async () => {
  const { captureCharFrame, mockInput, renderOnce, renderer } = await render()
  await press("h", mockInput, renderOnce)
  await press("x", mockInput, renderOnce)
  const frame = captureCharFrame()
  expect(frame).not.toContain("Help")
  renderer.destroy()
})
