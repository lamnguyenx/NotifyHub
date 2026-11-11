import { testRender } from "@opentui/react/test-utils"
import { expect, it } from "bun:test"
import { act } from "react"
import { PrototypeApp } from "../prototypes/PrototypeApp"
import { buildScenarios } from "../prototypes/scenarios"

async function render() {
  const result = await testRender(<PrototypeApp />, { width: 100, height: 36 })
  await act(async () => { await result.renderOnce() })
  return result
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

it("renders the overview from mock data without a backend", async () => {
  const { captureCharFrame, renderer } = await render()
  const frame = captureCharFrame()
  expect(frame).toContain("PROTOTYPE 1/7")
  expect(frame).toContain("◇ opencode")
  expect(frame).toContain("@USER")
  expect(frame).toContain("waiting for you")
  expect(frame).toContain("stalled?")
  renderer.destroy()
})

it("keeps loading fixtures live and ships a stalled card", () => {
  const now = new Date()
  const overview = buildScenarios(now).find((s) => s.id === "overview")!
  const running = overview.agentStatus.find((e) => e.session_id === "ses_proto_running")!
  const stalled = overview.agentStatus.find((e) => e.session_id === "ses_proto_stalled")!

  // Far-future `updated`: the client stale mirror never flips the loading card.
  expect(Date.parse(running.updated)).toBeGreaterThan(now.getTime() + 365 * 24 * 60 * 60 * 1000)
  expect(now.getTime() - Date.parse(stalled.updated)).toBeGreaterThan(5 * 60 * 1000)
})

it("switches scenarios with n and the number keys", async () => {
  const { captureCharFrame, mockInput, renderOnce, renderer } = await render()
  await press("n", mockInput, renderOnce)
  expect(captureCharFrame()).toContain("PROTOTYPE 2/7")
  await press("n", mockInput, renderOnce)
  expect(captureCharFrame()).toContain("PROTOTYPE 3/7")
  expect(captureCharFrame()).toContain("cursor")
  await press("5", mockInput, renderOnce)
  expect(captureCharFrame()).toContain("PROTOTYPE 5/7")
  expect(captureCharFrame()).toContain("LOCKED")
  renderer.destroy()
})

it("restarts the prototype with r", async () => {
  const { captureCharFrame, mockInput, renderOnce, renderer } = await render()
  await press("n", mockInput, renderOnce)
  await press("t", mockInput, renderOnce)
  expect(captureCharFrame()).toContain("PROTOTYPE 2/7")
  expect(captureCharFrame()).toContain("time frozen")

  await press("r", mockInput, renderOnce)
  expect(captureCharFrame()).toContain("PROTOTYPE 1/7")
  expect(captureCharFrame()).toContain("time live")
  renderer.destroy()
})

it("freezes the clock with t", async () => {
  const { captureCharFrame, mockInput, renderOnce, renderer } = await render()
  await press("t", mockInput, renderOnce)
  expect(captureCharFrame()).toContain("time frozen")
  await press("t", mockInput, renderOnce)
  expect(captureCharFrame()).toContain("time live")
  renderer.destroy()
})
