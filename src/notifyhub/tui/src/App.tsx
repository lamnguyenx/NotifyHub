import { useState, useCallback, useEffect } from "react"
import { useKeyboard, useRenderer } from "@opentui/react"
import { useTheme } from "./theme"
import { useNotifications } from "./hooks/useNotifications"
import { useNow } from "./hooks/useNow"
import { ErrorBoundary } from "./components/ErrorBoundary"
import { NotificationStream } from "./components/NotificationStream"
import { WaitingCards } from "./components/WaitingCards"
import { StatusPopup } from "./components/StatusPopup"
import { HelpPopup } from "./components/HelpPopup"

export function App() {
  const [showStatus, setShowStatus] = useState(false)
  const [showHelp, setShowHelp] = useState(false)
  const { notifications, agentStatus, serverInfo, hasMore, loadingMore, handleDelete, loadMore, lockedCount } = useNotifications()
  const waitingNow = useNow(10_000)
  const renderer = useRenderer()
  const theme = useTheme()

  useEffect(() => {
    const onCont = () => renderer.resume()
    process.on("SIGCONT", onCont)
    return () => { process.off("SIGCONT", onCont) }
  }, [])

  const dismissPopups = useCallback(() => {
    setShowStatus(false)
    setShowHelp(false)
  }, [])

  useKeyboard((key) => {
    if (key.ctrl && key.name === "z") {
      renderer.suspend()
      process.kill(process.pid, "SIGTSTP")
      return
    }
    if (key.name === "s") {
      setShowStatus((v) => !v)
      setShowHelp(false)
    } else if (key.name === "h" || key.name === "?") {
      setShowHelp((v) => !v)
      setShowStatus(false)
    } else if (showStatus || showHelp) {
      dismissPopups()
    } else if (key.name === "q") {
      renderer.destroy()
      // The SSE stream and poll timers keep the event loop alive; without an
      // explicit exit the screen goes blank but the process never returns.
      process.exit(0)
    }
  })

  return (
    <box flexDirection="column" width="100%" height="100%" backgroundColor={theme.background}>
      <box width="100%" flexGrow={1} flexDirection="column" minHeight={0}>
        <ErrorBoundary>
          <WaitingCards entries={agentStatus} now={waitingNow} />
          <NotificationStream
            notifications={notifications}
            onDelete={handleDelete}
            hasMore={hasMore}
            loadingMore={loadingMore}
            onLoadMore={loadMore}
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

      <box width="100%" height={1} backgroundColor={theme.footerBackground} paddingX={1}>
        <text fg={theme.dim}>
          v:select  |  arrows:scroll  |  s:status  |  h:help  |  q:quit
          {loadingMore ? "  |  loading older\u2026" : hasMore ? "  |  L:older" : ""}
        </text>
      </box>
    </box>
  )
}
