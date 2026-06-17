import { useState, useCallback, useEffect, useRef } from "react"
import { useKeyboard } from "@opentui/react"
import type { NotificationItem } from "../types"
import { NotificationRow } from "./NotificationRow"
import { useNotificationSound } from "../hooks/useAudio"

const SOUND_PATH = (() => {
  try {
    return new URL("../../assets/Submarine.mp3", import.meta.url).pathname
  } catch {
    return ""
  }
})()

interface Props {
  notifications: NotificationItem[]
  onDelete: (id: string) => void
}

export function NotificationStream({ notifications, onDelete }: Props) {
  const [selectedIdx, setSelectedIdx] = useState(-1)
  const [selectMode, setSelectMode] = useState(false)
  const playSound = useNotificationSound(SOUND_PATH)
  const prevCountRef = useRef(notifications.length)

  useEffect(() => {
    if (prevCountRef.current > 0 && notifications.length > prevCountRef.current) {
      playSound()
    }
    prevCountRef.current = notifications.length
  }, [notifications.length])

  useKeyboard((key) => {
    if (key.name === "v") {
      setSelectMode((prev) => {
        if (prev) setSelectedIdx(-1)
        return !prev
      })
      return
    }

    if (!selectMode) return

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
    } else if (key.name === "pageup") {
      setSelectedIdx((prev) => {
        if (notifications.length === 0) return -1
        const idx = prev < 0 ? 0 : prev
        return Math.max(idx - 5, 0)
      })
    } else if (key.name === "pagedown") {
      setSelectedIdx((prev) => {
        if (notifications.length === 0) return -1
        const idx = prev < 0 ? 0 : prev
        return Math.min(idx + 5, notifications.length - 1)
      })
    } else if (key.name === "home") {
      setSelectedIdx(notifications.length > 0 ? 0 : -1)
    } else if (key.name === "end") {
      setSelectedIdx(notifications.length > 0 ? notifications.length - 1 : -1)
    } else if (key.name === "delete" || key.name === "backspace") {
      setSelectedIdx((prev) => {
        if (notifications.length === 0 || prev < 0 || prev >= notifications.length) return prev
        onDelete(notifications[prev].id)
        return Math.max(0, Math.min(prev, notifications.length - 2))
      })
    } else if (key.name === "escape") {
      setSelectedIdx(-1)
    }
  })

  return (
    <scrollbox
      focused
      stickyScroll
      stickyStart="top"
      width="100%"
      height="100%"
      viewportCulling
    >
      {selectMode && (
        <box width="100%" height={1} backgroundColor="#1a3a5c" paddingX={1}>
          <text fg="#6fc3df">SELECT MODE  |  j/k/\u2191/\u2193: navigate  |  Del: delete  |  Esc: deselect  |  v: exit</text>
        </box>
      )}
      {notifications.length === 0 ? (
        <box height={3} width="100%">
          <text fg="#969696">Waiting for notifications\u2026</text>
        </box>
      ) : (
        notifications.map((n, i) => (
          <NotificationRow key={n.id} item={n} selected={i === selectedIdx} />
        ))
      )}
    </scrollbox>
  )
}
