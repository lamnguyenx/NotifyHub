import { testRender } from "@opentui/react/test-utils"
import { expect, it } from "bun:test"
import { WaitingCards } from "../components/WaitingCards"
import type { AgentStatusEntry } from "../types"

/** Waiting cards are display-only; entries arrive already decrypted. */
function entry(overrides: Partial<AgentStatusEntry> = {}): AgentStatusEntry {
  const now = new Date()
  return {
    agent: "opencode",
    session_id: "ses_test",
    state: "running",
    pwd: "/home/user/project",
    host: "wsk",
    task: "fix the flaky test",
    since: new Date(now.getTime() - 2 * 60 * 1000).toISOString(),
    updated: now.toISOString(),
    ...overrides,
  }
}

async function frameOf(children: ReturnType<typeof WaitingCards>, height = 10) {
  const { captureCharFrame, renderer, renderOnce } = await testRender(children, {
    width: 90,
    height,
  })
  await renderOnce()
  const frame = captureCharFrame()
  renderer.destroy()
  return frame
}

it("renders a waiting card with the user prompt and the coding agent", async () => {
  const frame = await frameOf(
    <WaitingCards entries={[entry()]} now={new Date()} />,
  )
  expect(frame).toContain("project")
  expect(frame).toContain("/home/user/project")
  expect(frame).toContain("◇ opencode")
  expect(frame).toContain("⌂ wsk")
  expect(frame).toContain("@USER")
  expect(frame).toContain("fix the flaky test")
  expect(frame).toContain("@ASSISTANT")
  expect(frame).toContain("loading")
  expect(frame).toContain("2m ago")
  expect(frame).toContain("╭")
  expect(frame).toContain("╰")
})

it("renders the reporting machine as a host pill", async () => {
  const frame = await frameOf(
    <WaitingCards entries={[entry({ host: "Mac153" })]} now={new Date()} />,
  )
  expect(frame).toContain("◇ opencode")
  expect(frame).toContain("⌂ Mac153")
})

it("omits the host pill when the reporter did not send a host", async () => {
  const frame = await frameOf(
    <WaitingCards entries={[entry({ host: null })]} now={new Date()} />,
  )
  expect(frame).toContain("◇ opencode")
  expect(frame).toContain("@ASSISTANT")
  expect(frame).not.toContain("wsk")
})

it("renders blocked and stalled states on the assistant line", async () => {
  const frame = await frameOf(
    <WaitingCards
      entries={[
        entry({ session_id: "b", agent: "claude", state: "blocked" }),
        entry({
          session_id: "c",
          agent: "codex",
          // Still reported as running, but silent past the 5-minute window:
          // the card mirrors staleness client-side.
          state: "running",
          updated: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
        }),
      ]}
      now={new Date()}
    />,
    18,
  )
  expect(frame).toContain("waiting for you")
  expect(frame).toContain("stalled?")
})

it("renders one card per live session", async () => {
  const frame = await frameOf(
    <WaitingCards
      entries={[
        entry({ session_id: "1" }),
        entry({ session_id: "2", agent: "codex", pwd: "/home/user/other" }),
      ]}
      now={new Date()}
    />,
    18,
  )
  expect(frame).toContain("◇ opencode")
  expect(frame).toContain("◐ codex")
  expect(frame).toContain("other")
})

it("falls back to a dim note when the task excerpt is missing", async () => {
  const frame = await frameOf(
    <WaitingCards entries={[entry({ task: null })]} now={new Date()} />,
  )
  expect(frame).toContain("@USER")
  expect(frame).toContain("no task excerpt")
})

it("hides idle entries and renders nothing when only idle sessions exist", async () => {
  const frame = await frameOf(
    <WaitingCards entries={[entry({ state: "idle" })]} now={new Date()} />,
  )
  expect(frame).not.toContain("opencode")
})
