import { TextAttributes } from "@opentui/core"
import { useTerminalDimensions } from "@opentui/react"
import { useTheme, type Theme } from "../theme"
import type { NotificationItem } from "../types"

export function formatRelativeTime(iso: string, now: Date = new Date()): string {
  if (!iso) return ""
  try {
    const d = new Date(iso)
    if (isNaN(d.getTime())) return iso

    const elapsed = Math.max(0, now.getTime() - d.getTime())

    const nowDay = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const msgDay = new Date(d.getFullYear(), d.getMonth(), d.getDate())
    const dayDiff = Math.round((nowDay.getTime() - msgDay.getTime()) / 86400000)

    if (dayDiff >= 2) {
      const month = String(d.getMonth() + 1).padStart(2, "0")
      const day = String(d.getDate()).padStart(2, "0")
      const year = String(d.getFullYear()).slice(-2)
      return `${month}/${day}/${year}`
    }

    if (dayDiff === 1) return "Yesterday"

    const secs = Math.floor(elapsed / 1000)
    if (secs < 60) return "now"

    const mins = Math.floor(secs / 60)
    if (mins < 60) return `${mins}m ago`

    const hours = Math.floor(mins / 60)
    return `${hours}h ago`
  } catch {
    return iso
  }
}

export function getAvatarColor(pwd: string): string {
  const colors = [
    "#7B1FA2", "#77919D", "#00ACC1", "#EC417A", "#C1175C",
    "#5D6AC0", "#0388D2", "#1E88E5", "#00BCD4", "#26A69A",
    "#43A047", "#68A039", "#EF6C00", "#F6511E", "#FF5252",
  ]
  let hash = 0
  for (let i = 0; i < pwd.length; i++) {
    hash = ((hash << 5) - hash) + pwd.charCodeAt(i)
    hash |= 0
  }
  return colors[Math.abs(hash) % colors.length]
}

export function getTitle(pwd: string | undefined | null): string {
  if (!pwd) return "notifyhub"
  const parts = pwd.split("/").filter(Boolean)
  return parts.pop() || "notifyhub"
}

export function truncate(str: string, max: number): string {
  if (str.length <= max) return str
  return str.slice(0, max - 1) + "\u2026"
}

export interface TagSegment {
  type: "text" | "tag" | "truncated"
  text: string
}

export function parseMessage(msg: string): TagSegment[] {
  const regex = /\[#(?:tag|truncated):(.*?)\]/g
  const segments: TagSegment[] = []
  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = regex.exec(msg)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ type: "text", text: msg.slice(lastIndex, match.index) })
    }
    const kind = match[0].startsWith("[#tag:") ? "tag" : "truncated"
    segments.push({ type: kind, text: match[1] })
    lastIndex = regex.lastIndex
  }

  if (lastIndex < msg.length) {
    segments.push({ type: "text", text: msg.slice(lastIndex) })
  }

  return segments
}

interface Props {
  item: NotificationItem
  selected?: boolean
  now?: Date
}

function renderSegments(segments: TagSegment[], lineKey: string, theme: Theme) {
  return segments.map((seg, i) => {
    const key = `${lineKey}-${seg.type}-${i}-${seg.text.slice(0, 8)}`
    if (seg.type === "tag") {
      return <span key={key} fg={theme.accent}>{seg.text}</span>
    }
    if (seg.type === "truncated") {
      return <span key={key} fg={theme.truncatedText}>{seg.text}</span>
    }
    return <span key={key}>{seg.text}</span>
  })
}

export function NotificationRow({ item, selected, now: propNow }: Props) {
  const now = propNow ?? new Date()
  const { width: termWidth } = useTerminalDimensions()
  const theme = useTheme()
  const msg = item.data?.message ?? ""
  const pwd = item.data?.pwd ?? ""
  const title = getTitle(pwd)
  const avatarColor = getAvatarColor(pwd)
  const avatarInitial = title[0]?.toUpperCase() || "N"
  const cardBg = selected ? theme.surfaceSelected : theme.background
  const borderColor = selected ? theme.borderSelected : theme.border
  const time = formatRelativeTime(item.timestamp, now)
  const hostModel = item.data?.host_model ?? ""
  const messageLines = msg.split("\n")
  const contentWidth = Math.max(40, termWidth - 4)
  const wrappedEstimate = messageLines.reduce(
    (sum, line) => sum + Math.max(1, Math.ceil(line.length / contentWidth)),
    0,
  )
  const cardHeight = 4 + wrappedEstimate + (hostModel ? 1 : 0)

  return (
    <box
      width="100%"
      height={cardHeight}
      borderStyle="rounded"
      borderColor={borderColor}
      backgroundColor={cardBg}
      paddingX={1}
      marginBottom={0}
    >
      <box flexDirection="column" gap={0} width="100%">
        <text>
          <span bg={avatarColor} fg="#ffffff"> {avatarInitial} </span>
          <span fg={theme.text} attributes={TextAttributes.BOLD}> {title}</span>
          <span fg={theme.dim}>  {time}</span>
        </text>
        <text fg={theme.pwdText}>{truncate(pwd, 80)}</text>
        {hostModel && (
          <text fg={theme.dim}>{hostModel}</text>
        )}
        {messageLines.map((line, lineIdx) => {
          const segments = parseMessage(line)
          return (
            <text key={`msg-ln-${lineIdx}`} fg={theme.text} selectable>
              {segments.length > 0
                ? renderSegments(segments, `ln${lineIdx}`, theme)
                : (line || "\u00a0")}
            </text>
          )
        })}
      </box>
    </box>
  )
}
