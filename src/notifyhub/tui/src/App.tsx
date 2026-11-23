import { useState, useCallback, useEffect, useRef, type ReactNode } from "react"
import { useKeyboard, useRenderer } from "@opentui/react"
import { useTheme } from "./theme"
import { useNotifications } from "./hooks/useNotifications"
import { useNow } from "./hooks/useNow"
import { ErrorBoundary } from "./components/ErrorBoundary"
import { NotificationStream } from "./components/NotificationStream"
import { WaitingCards, liveWaitingEntries, waitingEntryKey } from "./components/WaitingCards"
import { ContextMenu, type ContextMenuItem } from "./components/ContextMenu"
import { StatusPopup } from "./components/StatusPopup"
import { HelpPopup } from "./components/HelpPopup"
import type { AgentStatusEntry, NotificationData, NotificationItem, ServerInfo } from "./types"

const NOTIFICATION_KEY_PREFIX = "notification:"

const notificationKey = (id: string) => `${NOTIFICATION_KEY_PREFIX}${id}`

type ContextMenuTarget =
  | { kind: "notification"; item: NotificationItem }
  | { kind: "waiting"; entry: AgentStatusEntry }

interface ContextMenuState {
  target: ContextMenuTarget
  x: number
  y: number
  selectedIndex: number
}

/** Copy text without the plugins' inline tag/truncation markers. */
function plainMessage(message: string): string {
  return message
    .replace(/\[#truncated:.*?\]/g, "")
    .replace(/\[#tag:(.*?)\]/g, "$1")
    .replace(/[ \t]+$/gm, "")
    .trim()
}

export interface AppViewProps {
  notifications: NotificationItem[]
  agentStatus: AgentStatusEntry[]
  serverInfo: ServerInfo
  hasMore?: boolean
  loadingMore?: boolean
  handleDelete: (id: string) => void
  /** Dismiss a docked waiting card (local-only; the agent keeps running). */
  handleDismissAgentStatus: (sessionId: string) => void
  loadMore?: () => void
  lockedCount?: number
  /** Frozen clock for prototypes and screenshots; omit for the live clock. */
  now?: Date
  /** Harness chrome rendered above the waiting cards (prototype only). */
  header?: ReactNode
  /** Appended to the footer hints (prototype only). */
  footerExtra?: string
}

/**
 * The app's presentation shell, independent of where the data comes from.
 * `App` wires the live SSE store; the prototype harness wires fixtures.
 *
 * Select mode spans both areas in display order: docked waiting cards first,
 * then the notification feed. That way Delete works on either kind of card
 * without a second focus concept.
 */
export function AppView({
  notifications,
  agentStatus,
  serverInfo,
  hasMore,
  loadingMore,
  handleDelete,
  handleDismissAgentStatus,
  loadMore,
  lockedCount = 0,
  now,
  header,
  footerExtra,
}: AppViewProps) {
  const [showStatus, setShowStatus] = useState(false)
  const [showHelp, setShowHelp] = useState(false)
  const [selectMode, setSelectMode] = useState(false)
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const liveNow = useNow(10_000)
  const waitingNow = now ?? liveNow
  const renderer = useRenderer()
  const theme = useTheme()

  // Same order as WaitingCards renders, so j/k walk the visible dock first.
  const waitingEntries = liveWaitingEntries(agentStatus)
  const selectableKeys = [
    ...waitingEntries.map(waitingEntryKey),
    ...notifications.map((n) => notificationKey(n.id)),
  ]

  useEffect(() => {
    const onCont = () => renderer.resume()
    process.on("SIGCONT", onCont)
    return () => { process.off("SIGCONT", onCont) }
  }, [])

  useEffect(() => () => {
    if (noticeTimer.current) clearTimeout(noticeTimer.current)
  }, [])

  const flashNotice = useCallback((message: string) => {
    if (noticeTimer.current) clearTimeout(noticeTimer.current)
    setNotice(message)
    noticeTimer.current = setTimeout(() => {
      noticeTimer.current = null
      setNotice(null)
    }, 1500)
  }, [])

  const copyText = useCallback((label: string, text: string) => {
    const copied = renderer.copyToClipboardOSC52(text)
    flashNotice(copied ? `${label} copied` : "Clipboard unavailable")
  }, [renderer, flashNotice])

  const dismissPopups = useCallback(() => {
    setShowStatus(false)
    setShowHelp(false)
  }, [])

  const openContextMenu = useCallback((target: ContextMenuTarget, x: number, y: number) => {
    setShowStatus(false)
    setShowHelp(false)
    setContextMenu({ target, x, y, selectedIndex: 0 })
  }, [])

  // Menu actions still clear a selection that pointed at the removed card;
  // keyboard Delete computes the neighbouring selection explicitly below.
  const deleteNotification = useCallback((id: string) => {
    setSelectedKey((prev) => (prev === notificationKey(id) ? null : prev))
    handleDelete(id)
  }, [handleDelete])

  const dismissWaitingCard = useCallback((sessionId: string) => {
    setSelectedKey((prev) => {
      if (prev === null) return null
      const selectedEntry = waitingEntries.find((e) => waitingEntryKey(e) === prev)
      return selectedEntry?.session_id === sessionId ? null : prev
    })
    handleDismissAgentStatus(sessionId)
  }, [handleDismissAgentStatus, waitingEntries])

  const menuItems: ContextMenuItem[] = []
  if (contextMenu?.target.kind === "notification") {
    const item = contextMenu.target.item
    const data = (item.data ?? {}) as NotificationData
    const message = typeof data.message === "string" ? plainMessage(data.message).trim() : ""
    const pwd = typeof data.pwd === "string" ? data.pwd : ""
    menuItems.push({
      label: "Select card",
      run: () => {
        setSelectMode(true)
        setSelectedKey(notificationKey(item.id))
      },
    })
    if (message) {
      menuItems.push({
        label: "Copy message",
        run: () => copyText("Message", message),
      })
    }
    if (pwd) {
      menuItems.push({ label: "Copy pwd", run: () => copyText("Path", pwd) })
    }
    menuItems.push({
      label: "Delete notification",
      danger: true,
      run: () => deleteNotification(item.id),
    })
  } else if (contextMenu?.target.kind === "waiting") {
    const entry = contextMenu.target.entry
    const task = entry.task?.trim() ?? ""
    const pwd = entry.pwd ?? ""
    menuItems.push({
      label: "Select card",
      run: () => {
        setSelectMode(true)
        setSelectedKey(waitingEntryKey(entry))
      },
    })
    if (task) {
      menuItems.push({ label: "Copy task", run: () => copyText("Task", task) })
    }
    if (pwd) {
      menuItems.push({ label: "Copy pwd", run: () => copyText("Path", pwd) })
    }
    menuItems.push({
      label: "Copy session id",
      run: () => copyText("Session id", entry.session_id),
    })
    menuItems.push({
      label: "Dismiss card",
      danger: true,
      run: () => dismissWaitingCard(entry.session_id),
    })
  }

  const runContextMenuItem = useCallback((index: number) => {
    const item = menuItems[index]
    if (!item) return
    item.run()
    setContextMenu(null)
  }, [menuItems])

  useKeyboard((key) => {
    if (key.ctrl && key.name === "z") {
      renderer.suspend()
      process.kill(process.pid, "SIGTSTP")
      return
    }
    if (contextMenu) {
      const count = menuItems.length
      if (key.name === "escape") {
        setContextMenu(null)
        return
      }
      if (key.name === "up" || key.name === "k") {
        if (count === 0) return
        const current = Math.min(contextMenu.selectedIndex, count - 1)
        setContextMenu({ ...contextMenu, selectedIndex: (current - 1 + count) % count })
        return
      }
      if (key.name === "down" || key.name === "j") {
        if (count === 0) return
        const current = Math.min(contextMenu.selectedIndex, count - 1)
        setContextMenu({ ...contextMenu, selectedIndex: (current + 1) % count })
        return
      }
      if (key.name === "return" || key.name === "enter") {
        runContextMenuItem(contextMenu.selectedIndex)
        return
      }
      // Any other key closes the menu instead of triggering its global action.
      setContextMenu(null)
      return
    }
    if (key.name === "s") {
      setShowStatus((v) => !v)
      setShowHelp(false)
      return
    }
    if (key.name === "h" || key.name === "?") {
      setShowHelp((v) => !v)
      setShowStatus(false)
      return
    }
    if (showStatus || showHelp) {
      dismissPopups()
      return
    }
    if (key.name === "q") {
      renderer.destroy()
      // The SSE stream and poll timers keep the event loop alive; without an
      // explicit exit the screen goes blank but the process never returns.
      process.exit(0)
    }

    if (key.name === "l") {
      if (hasMore && !loadingMore) loadMore?.()
      return
    }

    if (key.name === "v") {
      if (selectMode) setSelectedKey(null)
      setSelectMode(!selectMode)
      return
    }

    if (!selectMode) return

    const count = selectableKeys.length
    const current = selectedKey === null ? -1 : selectableKeys.indexOf(selectedKey)
    const selectAt = (index: number) => {
      if (count === 0) {
        setSelectedKey(null)
        return
      }
      setSelectedKey(selectableKeys[Math.max(0, Math.min(index, count - 1))]!)
    }

    if (key.name === "down" || key.name === "j") {
      if (count === 0) return
      if (current < 0) {
        selectAt(0)
      } else if (current < count - 1) {
        selectAt(current + 1)
      } else if (hasMore && !loadingMore) {
        loadMore?.()
      }
    } else if (key.name === "up" || key.name === "k") {
      selectAt(current < 0 ? 0 : current - 1)
    } else if (key.name === "pageup") {
      selectAt(current < 0 ? 0 : current - 5)
    } else if (key.name === "pagedown") {
      selectAt(current < 0 ? 0 : current + 5)
    } else if (key.name === "home") {
      selectAt(0)
    } else if (key.name === "end") {
      selectAt(count - 1)
    } else if (key.name === "delete" || key.name === "backspace") {
      if (current < 0) return
      const target = selectableKeys[current]!
      const remaining = selectableKeys.filter((k) => k !== target)
      if (target.startsWith(NOTIFICATION_KEY_PREFIX)) {
        handleDelete(target.slice(NOTIFICATION_KEY_PREFIX.length))
      } else {
        const entry = waitingEntries.find((e) => waitingEntryKey(e) === target)
        if (!entry) return
        handleDismissAgentStatus(entry.session_id)
      }
      setSelectedKey(remaining.length > 0 ? remaining[Math.min(current, remaining.length - 1)]! : null)
    } else if (key.name === "escape") {
      setSelectedKey(null)
    }
  })

  const selectedNotificationId =
    selectedKey?.startsWith(NOTIFICATION_KEY_PREFIX)
      ? selectedKey.slice(NOTIFICATION_KEY_PREFIX.length)
      : null

  return (
    <box
      flexDirection="column"
      width="100%"
      height="100%"
      backgroundColor={theme.background}
      onMouseDown={() => setContextMenu(null)}
    >
      {header}
      <box width="100%" flexGrow={1} flexDirection="column" minHeight={0}>
        <ErrorBoundary>
          <WaitingCards
            entries={agentStatus}
            now={waitingNow}
            selectedKey={selectedKey}
            onContextMenu={(entry, x, y) => openContextMenu({ kind: "waiting", entry }, x, y)}
          />
          <NotificationStream
            notifications={notifications}
            selectMode={selectMode}
            selectedId={selectedNotificationId}
            hasMore={hasMore}
            loadingMore={loadingMore}
            onLoadMore={loadMore}
            onContextMenu={(item, x, y) => openContextMenu({ kind: "notification", item }, x, y)}
            now={now}
          />
        </ErrorBoundary>
      </box>

      {showStatus && (
        <StatusPopup
          serverInfo={serverInfo}
          notificationsCount={notifications.length}
          lockedCount={lockedCount}
        />
      )}

      {showHelp && <HelpPopup />}

      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          title={contextMenu.target.kind === "notification" ? "Notification" : "Waiting card"}
          items={menuItems}
          selectedIndex={contextMenu.selectedIndex}
          onHighlight={(index) =>
            setContextMenu((prev) => (prev ? { ...prev, selectedIndex: index } : prev))
          }
          onSelect={runContextMenuItem}
        />
      )}

      <box width="100%" height={1} backgroundColor={theme.footerBackground} paddingX={1}>
        <text fg={theme.dim}>
          v:select  |  arrows:scroll  |  s:status  |  h:help  |  q:quit
          {notice
            ? `  |  ${notice}`
            : loadingMore
              ? "  |  loading older\u2026"
              : hasMore
                ? "  |  L:older"
                : ""}
          {footerExtra ? `  |  ${footerExtra}` : ""}
        </text>
      </box>
    </box>
  )
}

export function App() {
  const {
    notifications,
    agentStatus,
    serverInfo,
    hasMore,
    loadingMore,
    handleDelete,
    dismissAgentStatus,
    loadMore,
    lockedCount,
  } = useNotifications()

  return (
    <AppView
      notifications={notifications}
      agentStatus={agentStatus}
      serverInfo={serverInfo}
      hasMore={hasMore}
      loadingMore={loadingMore}
      handleDelete={handleDelete}
      handleDismissAgentStatus={dismissAgentStatus}
      loadMore={loadMore}
      lockedCount={lockedCount}
    />
  )
}
