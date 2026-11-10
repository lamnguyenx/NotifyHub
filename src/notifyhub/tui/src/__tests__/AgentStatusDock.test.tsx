import { testRender } from "@opentui/react/test-utils"
import { afterEach, expect, it } from "bun:test"
import { AgentStatusDock } from "../components/AgentStatusDock"
import type { AgentStatusEntry } from "../types"

afterEach(() => {})

/** The live dock is display-only; entries arrive already decrypted. */
function entry(overrides: Partial<AgentStatusEntry> = {}): AgentStatusEntry {
  return {
    agent: "opencode",
    session_id: "ses_test",
    state: "running",
    pwd: "/home/user/project",
    host: "wsk",
    task: "fix the flaky test",
    since: new Date().toISOString(),
    updated: new Date().toISOString(),
    ...overrides,
  }
}

async function frameOf(children: ReturnType<typeof AgentStatusDock>, height = 8) {
  const { captureCharFrame, renderer, renderOnce } = await testRender(children, {
    width: 90,
    height,
  })
  await renderOnce()
  const frame = captureCharFrame()
  renderer.destroy()
  return frame
}

it("renders running rows with agent, dir and task excerpt", async () => {
  const frame = await frameOf(
    <AgentStatusDock entries={[entry()]} now={new Date()} />,
  )
  expect(frame).toContain("opencode")
  expect(frame).toContain("project")
  expect(frame).toContain("fix the flaky test")
})

it("renders blocked and stalled states with their markers", async () => {
  const frame = await frameOf(
    <AgentStatusDock
      entries={[
        entry({ session_id: "b", agent: "claude", state: "blocked" }),
        entry({
          session_id: "c",
          agent: "codex",
          state: "stale",
          updated: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
        }),
      ]}
      now={new Date()}
    />,
    8,
  )
  expect(frame).toContain("waiting for you")
  expect(frame).toContain("stalled?")
})

it("hides idle entries and renders nothing when only idle sessions exist", async () => {
  const frame = await frameOf(
    <AgentStatusDock entries={[entry({ state: "idle" })]} now={new Date()} />,
  )
  expect(frame).not.toContain("opencode")
})
