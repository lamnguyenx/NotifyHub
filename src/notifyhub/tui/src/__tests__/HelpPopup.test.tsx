import { testRender } from "@opentui/react/test-utils"
import { it, expect } from "bun:test"
import { act } from "react"
import { HelpPopup } from "../components/HelpPopup"

async function render() {
  const result = await testRender(<HelpPopup />, { width: 80, height: 24 })
  await act(async () => { await result.renderOnce() })
  return result
}

it("shows heading", async () => {
  const { captureCharFrame, renderer } = await render()
  const frame = captureCharFrame()
  expect(frame).toContain("NotifyHub")
  renderer.destroy()
})

it("shows Toggle select mode key binding", async () => {
  const { captureCharFrame, renderer } = await render()
  const frame = captureCharFrame()
  expect(frame).toContain("Toggle select mode")
  renderer.destroy()
})

it("shows dismiss instruction", async () => {
  const { captureCharFrame, renderer } = await render()
  const frame = captureCharFrame()
  expect(frame).toContain("Press any key to close")
  renderer.destroy()
})

it("renders rounded border", async () => {
  const { captureCharFrame, renderer } = await render()
  const frame = captureCharFrame()
  expect(frame).toContain("╭")
  expect(frame).toContain("╰")
  renderer.destroy()
})
