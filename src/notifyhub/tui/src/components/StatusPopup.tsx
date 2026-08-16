import { TextAttributes } from "@opentui/core"
import { useTerminalDimensions } from "@opentui/react"
import { useTheme } from "../theme"
import type { ServerInfo } from "../types"

interface Props {
  serverInfo: ServerInfo
  notificationsCount: number
}

export function StatusPopup({ serverInfo, notificationsCount }: Props) {
  const { width, height } = useTerminalDimensions()
  const theme = useTheme()
  const popupW = 38
  const popupH = 10
  const left = Math.floor((width - popupW) / 2)
  const top = Math.floor((height - popupH) / 2)

  return (
    <box
      position="absolute"
      left={left}
      top={top}
      width={popupW}
      height={popupH}
      borderStyle="rounded"
      borderColor={theme.border}
      backgroundColor={theme.background}
      padding={1}
      flexDirection="column"
      gap={1}
    >
      <text fg={theme.accent} attributes={TextAttributes.BOLD}>
        NotifyHub \u2014 Status
      </text>
      <text fg={serverInfo.connected ? theme.success : theme.danger}>
        <span>{serverInfo.connected ? "\u25cf Connected" : "\u25cb Disconnected"}</span>
        <span fg={theme.dim}>  {serverInfo.host}:{serverInfo.port}</span>
      </text>
      <text fg={theme.text}>
        Notifications: {notificationsCount}
      </text>
      <text fg={serverInfo.streaming ? theme.success : theme.warning}>
        {serverInfo.streaming ? "\u25cf SSE Streaming" : "\u25cb SSE Idle"}
      </text>
      <text fg={theme.dim}>
        Press any key to close
      </text>
    </box>
  )
}
