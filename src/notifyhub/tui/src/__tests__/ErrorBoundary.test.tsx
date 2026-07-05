import { testRender } from "@opentui/react/test-utils"
import { it, expect, afterEach } from "bun:test"
import { act } from "react"
import { ErrorBoundary } from "../components/ErrorBoundary"

function GoodChild({ text }: { text: string }) {
  return <text fg="#ffffff">{text}</text>
}

function Thrower() {
  throw new Error("test error")
  return null
}

async function render(ui: React.ReactElement) {
  const result = await testRender(ui, { width: 80, height: 24 })
  await act(async () => { await result.renderOnce() })
  return result
}

it("renders children normally when no error", async () => {
  const { captureCharFrame, renderer } = await render(
    <ErrorBoundary>
      <GoodChild text="hello world" />
    </ErrorBoundary>,
  )
  const frame = captureCharFrame()
  expect(frame).toContain("hello world")
  renderer.destroy()
})

it("catches errors and shows fallback message", async () => {
  const { captureCharFrame, renderer } = await render(
    <ErrorBoundary>
      <Thrower />
    </ErrorBoundary>,
  )
  const frame = captureCharFrame()
  expect(frame).toContain("Rendering error")
  expect(frame).toContain("test error")
  renderer.destroy()
})

it("renders custom fallback instead of default", async () => {
  const { captureCharFrame, renderer } = await render(
    <ErrorBoundary fallback={<text fg="#ff0000">Custom error</text>}>
      <Thrower />
    </ErrorBoundary>,
  )
  const frame = captureCharFrame()
  expect(frame).toContain("Custom error")
  expect(frame).not.toContain("Rendering error")
  renderer.destroy()
})
