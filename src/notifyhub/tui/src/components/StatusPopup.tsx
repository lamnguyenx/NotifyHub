import { TextAttributes } from "@opentui/core"
import { useTerminalDimensions } from "@opentui/react"
import { useTheme } from "../theme"
import type { ServerInfo } from "../types"
import { hasE2EKeySync } from "../utils/crypto"

interface Props {
  serverInfo: ServerInfo
  notificationsCount: number
  lockedCount?: number
}

export function StatusPopup({ serverInfo, notificationsCount, lockedCount = 0 }: Props) {
  const { width, height } = useTerminalDimensions()
  const theme = useTheme()
  const address = `${serverInfo.host}:${serverInfo.port}`
  // Wide enough for "● Disconnected  <host:port>" and the e2e line.
  const popupW = Math.min(width - 2, Math.max(46, address.length + 22))
  // 7 rows + 6 gaps + padding (2) + border (2). Too small a height makes Yoga
  // shrink rows onto each other.
  const popupH = 17
  const left = Math.floor((width - popupW) / 2)
  const top = Math.floor((height - popupH) / 2)

  const serverE2e = serverInfo.e2e
  const serverLine = serverE2e?.enabled
    ? `on (kid ${serverE2e.kid ?? "?"})`
    : serverE2e
      ? "off"
      : "unknown"
  const localKey = hasE2EKeySync()

  return (
    <box
      position="absolute"
      left={left}
      top={top}
      width={popupW}
      height={popupH}
      zIndex={100}
      borderStyle="rounded"
      borderColor={theme.border}
      backgroundColor={theme.background}
      padding={1}
      flexDirection="column"
      gap={1}
    >
      <text fg={theme.accent} attributes={TextAttributes.BOLD}>{"NotifyHub \u2014 Status"}</text>
      <text fg={serverInfo.connected ? theme.success : theme.danger}>
        <span>{serverInfo.connected ? "\u25cf Connected" : "\u25cb Disconnected"}</span>
        <span fg={theme.dim}>{`  ${address}`}</span>
      </text>
      <text fg={theme.text}>
        Notifications: {notificationsCount}
      </text>
      <text fg={serverInfo.streaming ? theme.success : theme.warning}>
        {serverInfo.streaming ? "\u25cf SSE Streaming" : "\u25cb SSE Idle"}
      </text>
      <text fg={theme.text}>
        <span>E2E server: </span>
        <span fg={serverE2e?.enabled ? theme.success : theme.dim}>{serverLine}</span>
        <span fg={theme.dim}> | key: </span>
        <span fg={localKey ? theme.success : theme.dim}>{localKey ? "set" : "none"}</span>
      </text>
      <text fg={lockedCount > 0 ? theme.warning : theme.dim}>
        {lockedCount > 0
          ? `Locked rows: ${lockedCount} (wrong or missing key)`
          : "Locked rows: 0"}
      </text>
      <text fg={theme.dim}>
        Press any key to close
      </text>
    </box>
  )
}
