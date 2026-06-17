import { TextAttributes } from "@opentui/core"
import { useTerminalDimensions } from "@opentui/react"
import type { ServerInfo } from "../types"

interface Props {
  serverInfo: ServerInfo
  notificationsCount: number
}

export function StatusPopup({ serverInfo, notificationsCount }: Props) {
  const { width, height } = useTerminalDimensions()
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
      borderColor="#ffffff"
      backgroundColor="#000000"
      padding={1}
      flexDirection="column"
      gap={1}
    >
      <text fg="#6fc3df" attributes={TextAttributes.BOLD}>
        NotifyHub \u2014 Status
      </text>
      <text fg={serverInfo.connected ? "#15ff15" : "#ff5555"}>
        <span>{serverInfo.connected ? "\u25cf Connected" : "\u25cb Disconnected"}</span>
        <span fg="#969696">  {serverInfo.host}:{serverInfo.port}</span>
      </text>
      <text fg="#ffffff">
        Notifications: {notificationsCount}
      </text>
      <text fg={serverInfo.streaming ? "#15ff15" : "#ffcc00"}>
        {serverInfo.streaming ? "\u25cf SSE Streaming" : "\u25cb SSE Idle"}
      </text>
      <text fg="#969696">
        Press any key to close
      </text>
    </box>
  )
}
