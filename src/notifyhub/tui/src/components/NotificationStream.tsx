import { useState } from "react"
import { useKeyboard } from "@opentui/react"
import type { NotificationItem } from "../types"
import { NotificationRow } from "./NotificationRow"

interface Props {
  notifications: NotificationItem[]
  onDelete: (id: string) => void
}

export function NotificationStream({ notifications, onDelete }: Props) {
  const [selectedIdx, setSelectedIdx] = useState(-1)

  useKeyboard((key) => {
    if (notifications.length === 0) return
    const idx = selectedIdx < 0 ? 0 : selectedIdx
    if (key.name === "down" || key.name === "j") {
      setSelectedIdx(Math.min(idx + 1, notifications.length - 1))
    } else if (key.name === "up" || key.name === "k") {
      setSelectedIdx(Math.max(idx - 1, 0))
    } else if (key.name === "delete" || key.name === "backspace") {
      if (idx >= 0 && idx < notifications.length) {
        onDelete(notifications[idx].id)
        setSelectedIdx((prev) => Math.min(prev, notifications.length - 2))
      }
    }
  })

  return (
    <scrollbox
      stickyScroll
      stickyStart="bottom"
      width="100%"
      height="100%"
      viewportCulling
    >
      {notifications.length === 0 ? (
        <box height={3} width="100%">
          <text fg="#888888">Waiting for notifications…</text>
        </box>
      ) : (
        notifications.map((n, i) => (
          <NotificationRow key={n.id} item={n} selected={i === selectedIdx} />
        ))
      )}
    </scrollbox>
  )
}
