import { testRender } from "@opentui/react/test-utils"
import { it, expect, afterEach } from "bun:test"
import { act } from "react"
import { StatusPopup } from "../components/StatusPopup"
import type { ServerInfo } from "../types"

const connectedInfo: ServerInfo = {
  connected: true, streaming: true, notificationsCount: 5, port: 9080, host: "localhost",
}

const disconnectedInfo: ServerInfo = {
  connected: false, streaming: false, notificationsCount: 0, port: 9080, host: "localhost",
}

const idleInfo: ServerInfo = {
  connected: true, streaming: false, notificationsCount: 3, port: 9080, host: "localhost",
}

async function render(info: ServerInfo, count?: number) {
  const result = await testRender(
    <StatusPopup serverInfo={info} notificationsCount={count ?? info.notificationsCount} />,
    { width: 80, height: 24 },
  )
  await act(async () => { await result.renderOnce() })
  return result
}

it("shows Connected with green indicator", async () => {
  const { captureCharFrame, renderer } = await render(connectedInfo)
  const frame = captureCharFrame()
  expect(frame).toContain("● Connected")
  renderer.destroy()
})

it("shows host and port", async () => {
  const { captureCharFrame, renderer } = await render(connectedInfo)
  const frame = captureCharFrame()
  expect(frame).toContain("localhost:9080")
  renderer.destroy()
})

it("shows notification count", async () => {
  const { captureCharFrame, renderer } = await render(connectedInfo, 5)
  const frame = captureCharFrame()
  expect(frame).toContain("Notifications: 5")
  renderer.destroy()
})

it("shows SSE Streaming indicator", async () => {
  const { captureCharFrame, renderer } = await render(connectedInfo)
  const frame = captureCharFrame()
  expect(frame).toContain("● SSE Streaming")
  renderer.destroy()
})

it("shows NotifyHub heading", async () => {
  const { captureCharFrame, renderer } = await render(connectedInfo)
  const frame = captureCharFrame()
  expect(frame).toContain("NotifyHub")
  expect(frame).toContain("Status")
  renderer.destroy()
})

it("shows Press any key to close", async () => {
  const { captureCharFrame, renderer } = await render(connectedInfo)
  const frame = captureCharFrame()
  expect(frame).toContain("Press any key to close")
  renderer.destroy()
})

it("shows Disconnected when not connected", async () => {
  const { captureCharFrame, renderer } = await render(disconnectedInfo)
  const frame = captureCharFrame()
  expect(frame).toContain("○ Disconnected")
  renderer.destroy()
})

it("shows SSE Idle when not streaming", async () => {
  const { captureCharFrame, renderer } = await render(idleInfo)
  const frame = captureCharFrame()
  expect(frame).toContain("○ SSE Idle")
  renderer.destroy()
})

it("shows zero notifications", async () => {
  const { captureCharFrame, renderer } = await render(disconnectedInfo, 0)
  const frame = captureCharFrame()
  expect(frame).toContain("Notifications: 0")
  renderer.destroy()
})

it("renders rounded border", async () => {
  const { captureCharFrame, renderer } = await render(connectedInfo)
  const frame = captureCharFrame()
  expect(frame).toContain("╭")
  expect(frame).toContain("╰")
  renderer.destroy()
})
