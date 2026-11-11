import { testRender } from "@opentui/react/test-utils"
import { rgbToHex } from "@opentui/core"
import { expect, it } from "bun:test"
import { WaitingCards, loadingWordFor } from "../components/WaitingCards"
import { mixHex } from "../components/NotificationRow"
import { DARK_THEME } from "../theme"
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
  expect(frame).toContain(loadingWordFor("ses_test:fix the flaky test"))
  expect(frame).toContain("2m ago")
  expect(frame).toContain("╭")
  expect(frame).toContain("╰")
})

it("snaps the loading status and spinner to the card's bottom-right corner", async () => {
  const frame = await frameOf(
    <WaitingCards entries={[entry()]} now={new Date()} />,
  )
  const word = loadingWordFor("ses_test:fix the flaky test")
  const line = frame.split("\n").find((l) => l.includes("@ASSISTANT"))
  expect(line).toBeDefined()
  expect(line!.indexOf("@ASSISTANT")).toBeLessThan(10)
  expect(line!.indexOf(word)).toBeGreaterThan(line!.length / 2)
})

it("picks one playful word per message", () => {
  const first = loadingWordFor("ses_test:fix the flaky test")
  expect(loadingWordFor("ses_test:fix the flaky test")).toBe(first)
  expect(loadingWordFor("ses_test:ship the fix")).not.toBe(first)
})

it("animates the loading word with a color wave", async () => {
  const { captureSpans, renderer, renderOnce } = await testRender(
    <WaitingCards entries={[entry()]} now={new Date()} />,
    { width: 90, height: 10 },
  )
  await renderOnce()

  const line = captureSpans().lines.find((l) =>
    l.spans.some((s) => s.text.includes("@ASSISTANT")),
  )
  expect(line).toBeDefined()
  const colors = new Set(
    line!.spans
      .filter((s) => s.text.trim().length > 0 && /^[a-z -]+$/.test(s.text))
      .map((s) => rgbToHex(s.fg).toLowerCase()),
  )
  expect(colors.size).toBeGreaterThan(1)
  renderer.destroy()
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

it("colors permission waits as warning and stalls as danger", async () => {
  const now = new Date()
  const { captureSpans, renderer, renderOnce } = await testRender(
    <WaitingCards
      entries={[
        entry({ session_id: "b", agent: "claude", state: "blocked" }),
        entry({
          session_id: "c",
          agent: "codex",
          // Still reported as running, but silent past the stale window.
          state: "running",
          updated: new Date(now.getTime() - 10 * 60 * 1000).toISOString(),
        }),
      ]}
      now={now}
    />,
    { width: 90, height: 18 },
  )
  await renderOnce()

  const spans = captureSpans().lines.flatMap((line) => line.spans)
  const blocked = spans.find((span) => span.text.includes("waiting for you"))
  const stalled = spans.find((span) => span.text.includes("stalled?"))
  expect(blocked).toBeDefined()
  expect(stalled).toBeDefined()
  expect(rgbToHex(blocked!.fg).toLowerCase()).toBe(DARK_THEME.warning.toLowerCase())
  expect(rgbToHex(stalled!.fg).toLowerCase()).toBe(DARK_THEME.danger.toLowerCase())
  renderer.destroy()
})

it("tints each card background from its border color", async () => {
  const now = new Date()
  const { captureSpans, renderer, renderOnce } = await testRender(
    <WaitingCards
      entries={[
        entry({ task: "running task" }),
        entry({ session_id: "b", agent: "claude", state: "blocked", task: "permission task" }),
        entry({
          session_id: "c",
          agent: "codex",
          state: "running",
          task: "stalled task",
          updated: new Date(now.getTime() - 10 * 60 * 1000).toISOString(),
        }),
      ]}
      now={now}
    />,
    { width: 90, height: 24 },
  )
  await renderOnce()

  const spans = captureSpans().lines.flatMap((line) => line.spans)
  const bgFor = (text: string) => {
    const span = spans.find((s) => s.text.includes(text))
    return span ? rgbToHex(span.bg).toLowerCase() : undefined
  }
  const tint = (border: string) => mixHex(border, DARK_THEME.background, 0.1).toLowerCase()

  expect(bgFor("running task")).toBe(tint(DARK_THEME.accent))
  expect(bgFor("waiting for you")).toBe(tint(DARK_THEME.warning))
  expect(bgFor("stalled?")).toBe(tint(DARK_THEME.danger))
  renderer.destroy()
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
