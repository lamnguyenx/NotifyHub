import { useState, useCallback, useEffect } from "react"
import { useKeyboard, useRenderer } from "@opentui/react"
import { useNotifications } from "./hooks/useNotifications"
import { ErrorBoundary } from "./components/ErrorBoundary"
import { NotificationStream } from "./components/NotificationStream"
import { StatusPopup } from "./components/StatusPopup"
import { HelpPopup } from "./components/HelpPopup"

export function App() {
  const [showStatus, setShowStatus] = useState(false)
  const [showHelp, setShowHelp] = useState(false)
  const { notifications, serverInfo, handleDelete } = useNotifications()
  const renderer = useRenderer()

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
    }
  })

  return (
    <box flexDirection="column" width="100%" height="100%" backgroundColor="#000000">
      <box width="100%" flexGrow={1}>
        <ErrorBoundary>
          <NotificationStream
            notifications={notifications}
            onDelete={handleDelete}
          />
        </ErrorBoundary>
      </box>

      {showStatus && (
        <StatusPopup
          serverInfo={serverInfo}
          notificationsCount={notifications.length}
        />
      )}

      {showHelp && <HelpPopup />}

      <box width="100%" height={1} backgroundColor="#2a2a2a" paddingX={1}>
        <text fg="#969696">
          v:select  |  arrows:scroll  |  s:status  |  h:help  |  q:quit
        </text>
      </box>
    </box>
  )
}
