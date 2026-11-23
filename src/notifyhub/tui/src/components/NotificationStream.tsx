import { useEffect, useRef } from "react"
import type { ScrollBoxRenderable } from "@opentui/core"
import { useTheme } from "../theme"
import type { NotificationItem } from "../types"
import { NotificationRow } from "./NotificationRow"
import { useNow } from "../hooks/useNow"

const rowId = (id: string) => `notification-row-${id}`

interface Props {
  notifications: NotificationItem[]
  /** Select mode and the focused notification live in AppView so the docked
   * waiting cards and the feed share one selection order. */
  selectMode?: boolean
  selectedId?: string | null
  hasMore?: boolean
  loadingMore?: boolean
  onLoadMore?: () => void
  /** Right-click: open the notification's context menu. */
  onContextMenu?: (item: NotificationItem, x: number, y: number) => void
  /** Frozen clock for prototypes and screenshots; omit for the live clock. */
  now?: Date
}

export function NotificationStream({
  notifications,
  selectMode = false,
  selectedId = null,
  hasMore,
  loadingMore,
  onLoadMore,
  onContextMenu,
  now: frozenNow,
}: Props) {
  const liveNow = useNow()
  const now = frozenNow ?? liveNow
  const scrollRef = useRef<ScrollBoxRenderable | null>(null)
  const theme = useTheme()

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

  // Keep the selected card visible while navigating in select mode.
  useEffect(() => {
    if (selectedId === null || selectedId === undefined) return
    // Defer one tick so the new selection has been laid out.
    const t = setTimeout(() => scrollRef.current?.scrollChildIntoView(rowId(selectedId)), 0)
    return () => clearTimeout(t)
  }, [selectedId])

  return (
    <>
      {selectMode && (
        <box width="100%" height={1} flexShrink={0} backgroundColor={theme.accentBg} paddingX={1}>
          <text fg={theme.accent} wrapMode="none">
            {"SELECT MODE | j/k: navigate | Del: delete/dismiss | Esc: deselect | v: exit"}
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
          notifications.map((n) => (
            <NotificationRow
              key={n.id}
              id={rowId(n.id)}
              item={n}
              selected={n.id === selectedId}
              now={now}
              onContextMenu={onContextMenu}
            />
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
