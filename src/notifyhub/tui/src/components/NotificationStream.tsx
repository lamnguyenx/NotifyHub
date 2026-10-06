import { useState, useEffect, useRef } from "react"
import { useKeyboard } from "@opentui/react"
import type { ScrollBoxRenderable } from "@opentui/core"
import { useTheme } from "../theme"
import type { NotificationItem } from "../types"
import { NotificationRow } from "./NotificationRow"
import { useNotificationSound } from "../hooks/useAudio"
import { useNow } from "../hooks/useNow"

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
  hasMore?: boolean
  loadingMore?: boolean
  onLoadMore?: () => void
}

export function NotificationStream({ notifications, onDelete, hasMore, loadingMore, onLoadMore }: Props) {
  const [selectedIdx, setSelectedIdx] = useState(-1)
  const [selectMode, setSelectMode] = useState(false)
  const now = useNow()
  const playSound = useNotificationSound(SOUND_PATH)
  const prevCountRef = useRef(notifications.length)
  const scrollRef = useRef<ScrollBoxRenderable | null>(null)
  const theme = useTheme()

  useEffect(() => {
    if (prevCountRef.current > 0 && notifications.length > prevCountRef.current) {
      playSound()
    }
    prevCountRef.current = notifications.length
  }, [notifications.length])

  // Auto-load older notifications when the viewport reaches the bottom.
  // ScrollBox has no scroll event in the React bindings, so poll lightly.
  useEffect(() => {
    if (!hasMore || loadingMore || !onLoadMore) return
    const id = setInterval(() => {
      const sb = scrollRef.current
      if (!sb) return
      const scrollTop = sb.scrollTop ?? 0
      const scrollHeight = sb.scrollHeight ?? 0
      const viewportHeight = sb.viewport?.height ?? 0
      if (scrollHeight > 0 && scrollTop + viewportHeight >= scrollHeight - 2) {
        onLoadMore()
      }
    }, 200)
    return () => clearInterval(id)
  }, [hasMore, loadingMore, onLoadMore])

  useKeyboard((key) => {
    if (key.name === "v") {
      setSelectMode((prev) => {
        if (prev) setSelectedIdx(-1)
        return !prev
      })
      return
    }

    if (key.name === "l") {
      if (hasMore && !loadingMore) onLoadMore?.()
      return
    }

    if (!selectMode) return

    if (key.name === "down" || key.name === "j") {
      if (notifications.length === 0) {
        setSelectedIdx(-1)
        return
      }
      const idx = selectedIdx < 0 ? 0 : selectedIdx
      if (idx >= notifications.length - 1 && hasMore) onLoadMore?.()
      setSelectedIdx(Math.min(idx + 1, notifications.length - 1))
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
      ref={scrollRef}
      focused
      stickyScroll
      stickyStart="top"
      width="100%"
      height="100%"
      viewportCulling
    >
      {selectMode && (
        <box width="100%" height={1} backgroundColor={theme.accentBg} paddingX={1}>
          <text fg={theme.accent}>SELECT MODE  |  j/k/\u2191/\u2193: navigate  |  Del: delete  |  Esc: deselect  |  v: exit</text>
        </box>
      )}
      {notifications.length === 0 ? (
        <box height={3} width="100%">
          <text fg={theme.dim}>Waiting for notifications\u2026</text>
        </box>
      ) : (
        notifications.map((n, i) => (
          <NotificationRow key={n.id} item={n} selected={i === selectedIdx} now={now} />
        ))
      )}
      {hasMore && (
        <box width="100%" height={1} paddingX={1}>
          <text fg={theme.dim}>
            {loadingMore ? "Loading older notifications\u2026" : "\u2193 scroll down (or press L) to load older"}
          </text>
        </box>
      )}
    </scrollbox>
  )
}
