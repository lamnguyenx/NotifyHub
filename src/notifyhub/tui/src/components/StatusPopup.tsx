import { TextAttributes } from "@opentui/core"
import { useTerminalDimensions } from "@opentui/react"
import type { ServerInfo } from "../types"

interface Props {
  serverInfo: ServerInfo
  notificationsCount: number
}

export function StatusPopup({ serverInfo, notificationsCount }: Props) {
  const { width, height } = useTerminalDimensions()
  const popupW = 36
  const popupH = 9
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
      borderColor="#444444"
      backgroundColor="#111111"
      padding={1}
      flexDirection="column"
      gap={1}
    >
      <text fg="#4fc3f7" attributes={TextAttributes.BOLD}>
        NotifyHub — Status
      </text>
      <text fg={serverInfo.connected ? "#66bb6a" : "#ef5350"}>
        <span>{serverInfo.connected ? "● Connected" : "○ Disconnected"}</span>
        <span fg="#888888">  {serverInfo.host}:{serverInfo.port}</span>
      </text>
      <text fg="#ffffff">
        Notifications: {notificationsCount}
      </text>
      <text fg="#ffa726">
        SSE Streaming
      </text>
      <text fg="#555555">
        Press any key to close
      </text>
    </box>
  )
}
