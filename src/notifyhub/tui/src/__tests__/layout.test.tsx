import { testRender } from "@opentui/react/test-utils"
import { expect, it } from "bun:test"
import { act } from "react"
import { AgentStatusDock } from "../components/AgentStatusDock"
import { NotificationStream } from "../components/NotificationStream"
import type { AgentStatusEntry, NotificationItem } from "../types"

/** Mirrors App.tsx: flex column, dock + stream in a flexGrow area, footer. */
function layout() {
  const now = new Date()
  const entries: AgentStatusEntry[] = [1, 2, 3].map((i) => ({
    agent: "opencode",
    session_id: `s${i}`,
    state: "running",
    pwd: `/home/user/proj${i}`,
    host: "wsk",
    task: null,
    since: now.toISOString(),
    updated: now.toISOString(),
  }))
  const items: NotificationItem[] = Array.from({ length: 20 }, (_, i) => ({
    id: String(i),
    data: { message: `notification-${i}` },
    timestamp: now.toISOString(),
  }))

  return (
    <box flexDirection="column" width="100%" height="100%">
      <box width="100%" flexGrow={1} flexDirection="column" minHeight={0}>
        <AgentStatusDock entries={entries} now={now} />
        <NotificationStream notifications={items} onDelete={() => {}} />
      </box>
      <box width="100%" height={1}>
        <text>FOOTER</text>
      </box>
    </box>
  )
}

it("dock keeps its full height above the notification stream", async () => {
  const r = await testRender(layout(), { width: 60, height: 16 })
  await act(async () => { await r.renderOnce() })
  const lines = r.captureCharFrame().split("\n")

  // All three dock rows survive; the stream must not overwrite one of them.
  expect(lines[1]).toContain("proj1")
  expect(lines[2]).toContain("proj2")
  expect(lines[3]).toContain("proj3")
  expect(lines.slice(0, 5).join("\n")).not.toContain("notification-")

  // The stream still renders in the space below the dock.
  expect(lines.slice(5).join("\n")).toContain("notification-0")
  expect(lines[15]).toContain("FOOTER")
  r.renderer.destroy()
})
