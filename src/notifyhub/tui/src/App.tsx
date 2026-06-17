import { useState, useCallback } from "react"
import { useKeyboard, useRenderer } from "@opentui/react"
import { useNotifications } from "./hooks/useNotifications"
import { ErrorBoundary } from "./components/ErrorBoundary"
import { NotificationStream } from "./components/NotificationStream"
import { StatusPopup } from "./components/StatusPopup"

export function App() {
  const [showStatus, setShowStatus] = useState(false)
  const { notifications, serverInfo, handleDelete } = useNotifications()
  const renderer = useRenderer()

  const dismissStatus = useCallback(() => setShowStatus(false), [])

  useKeyboard((key) => {
    if (key.name === "s") {
      setShowStatus((v) => !v)
    } else if (showStatus) {
      dismissStatus()
    } else if (key.name === "q") {
      renderer.destroy()
    }
  })

  return (
    <box flexDirection="column" width="100%" height="100%" backgroundColor="#0a0a0a">
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

      <box width="100%" height={1} backgroundColor="#0d0d0d" paddingX={1}>
        <text fg="#666666">
          j/k: select  |  Del: delete  |  s: status  |  q: quit
        </text>
      </box>
    </box>
  )
}
