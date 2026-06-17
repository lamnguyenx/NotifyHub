import { useState, useCallback } from "react"
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
    if (key.name === "down" || key.name === "j") {
      setSelectedIdx((prev) => {
        if (notifications.length === 0) return -1
        const idx = prev < 0 ? 0 : prev
        return Math.min(idx + 1, notifications.length - 1)
      })
    } else if (key.name === "up" || key.name === "k") {
      setSelectedIdx((prev) => {
        if (notifications.length === 0) return -1
        const idx = prev < 0 ? 0 : prev
        return Math.max(idx - 1, 0)
      })
    } else if (key.name === "delete" || key.name === "backspace") {
      setSelectedIdx((prev) => {
        if (notifications.length === 0 || prev < 0 || prev >= notifications.length) return prev
        onDelete(notifications[prev].id)
        return Math.max(0, Math.min(prev, notifications.length - 2))
      })
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
          <text fg="#888888">Waiting for notifications\u2026</text>
        </box>
      ) : (
        notifications.map((n, i) => (
          <NotificationRow key={n.id} item={n} selected={i === selectedIdx} />
        ))
      )}
    </scrollbox>
  )
}
