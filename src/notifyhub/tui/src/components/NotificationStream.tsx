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

const rowId = (id: string) => `notification-row-${id}`

interface Props {
  notifications: NotificationItem[]
  onDelete: (id: string) => void
  hasMore?: boolean
  loadingMore?: boolean
  onLoadMore?: () => void
  /** Frozen clock for prototypes and screenshots; omit for the live clock. */
  now?: Date
}

export function NotificationStream({ notifications, onDelete, hasMore, loadingMore, onLoadMore, now: frozenNow }: Props) {
  const [selectedIdx, setSelectedIdx] = useState(-1)
  const [selectMode, setSelectMode] = useState(false)
  const liveNow = useNow()
  const now = frozenNow ?? liveNow
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
      if (notifications.length === 0 || selectedIdx < 0 || selectedIdx >= notifications.length) return
      onDelete(notifications[selectedIdx].id)
      setSelectedIdx(Math.max(0, Math.min(selectedIdx, notifications.length - 2)))
    } else if (key.name === "escape") {
      setSelectedIdx(-1)
    }
  })

  // Keep the selected card visible while navigating in select mode.
  const selectedId = selectedIdx >= 0 ? notifications[selectedIdx]?.id : undefined
  useEffect(() => {
    if (selectedId === undefined) return
    // Defer one tick so the new selection has been laid out.
    const t = setTimeout(() => scrollRef.current?.scrollChildIntoView(rowId(selectedId)), 0)
    return () => clearTimeout(t)
  }, [selectedId])

  return (
    <>
      {selectMode && (
        <box width="100%" height={1} flexShrink={0} backgroundColor={theme.accentBg} paddingX={1}>
          <text fg={theme.accent} wrapMode="none">
            {"SELECT MODE  |  j/k/\u2191/\u2193: navigate  |  Del: delete  |  Esc: deselect  |  v: exit"}
          </text>
        </box>
      )}
      <scrollbox
        ref={scrollRef}
        focused
        stickyScroll
        stickyStart="top"
        width="100%"
        flexGrow={1}
        minHeight={0}
        viewportCulling
      >
        {notifications.length === 0 ? (
          <box height={3} width="100%" paddingX={1}>
            <text fg={theme.dim}>{"Waiting for notifications\u2026"}</text>
          </box>
        ) : (
          notifications.map((n, i) => (
            <NotificationRow key={n.id} id={rowId(n.id)} item={n} selected={i === selectedIdx} now={now} />
          ))
        )}
        {hasMore && (
          <box width="100%" height={1} flexShrink={0} paddingX={1}>
            <text fg={theme.dim}>
              {loadingMore ? "Loading older notifications\u2026" : "\u2193 scroll down (or press L) to load older"}
            </text>
          </box>
        )}
      </scrollbox>
    </>
  )
}
