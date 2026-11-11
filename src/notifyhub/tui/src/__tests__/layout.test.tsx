import { testRender } from "@opentui/react/test-utils"
import { expect, it } from "bun:test"
import { act } from "react"
import { WaitingCards, loadingWordFor } from "../components/WaitingCards"
import { NotificationStream } from "../components/NotificationStream"
import type { AgentStatusEntry, NotificationItem } from "../types"

/** Mirrors App.tsx: flex column, waiting cards + stream in a flexGrow area, footer. */
function layout() {
  const now = new Date()
  const entries: AgentStatusEntry[] = [{
    agent: "opencode",
    session_id: "s1",
    state: "running",
    pwd: "/home/user/proj1",
    host: "wsk",
    task: "task-1",
    since: now.toISOString(),
    updated: now.toISOString(),
  }]
  const items: NotificationItem[] = Array.from({ length: 20 }, (_, i) => ({
    id: String(i),
    data: { message: `notification-${i}` },
    timestamp: now.toISOString(),
  }))

  return (
    <box flexDirection="column" width="100%" height="100%">
      <box width="100%" flexGrow={1} flexDirection="column" minHeight={0}>
        <WaitingCards entries={entries} now={now} />
        <NotificationStream notifications={items} onDelete={() => {}} />
      </box>
      <box width="100%" height={1}>
        <text>FOOTER</text>
      </box>
    </box>
  )
}

it("waiting cards keep their full height above the notification stream", async () => {
  const r = await testRender(layout(), { width: 60, height: 20 })
  await act(async () => { await r.renderOnce() })
  const lines = r.captureCharFrame().split("\n")

  // Card rows survive: header, pwd, prompt, assistant; the stream must not
  // overwrite any of them.
  expect(lines[1]).toContain("proj1")
  expect(lines[3]).toContain("/home/user/proj1")
  expect(lines[4]).toContain("@USER")
  expect(lines[4]).toContain("task-1")
  expect(lines[5]).toContain("@ASSISTANT")
  expect(lines[5]).toContain(loadingWordFor("s1:task-1"))
  expect(lines.slice(0, 8).join("\n")).not.toContain("notification-")

  // The stream still renders in the space below the card.
  expect(lines.slice(8).join("\n")).toContain("notification-0")
  expect(lines[19]).toContain("FOOTER")
  r.renderer.destroy()
})
