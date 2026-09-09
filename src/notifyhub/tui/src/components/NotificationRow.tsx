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

export const AVATAR_COLORS = [
  "#7B1FA2", "#77919D", "#00ACC1", "#EC417A", "#C1175C",
  "#5D6AC0", "#0388D2", "#1E88E5", "#00BCD4", "#26A69A",
  "#43A047", "#68A039", "#EF6C00", "#F6511E", "#FF5252",
]

export function getAvatarColor(pwd: string): string {
  let hash = 0
  for (let i = 0; i < pwd.length; i++) {
    hash = ((hash << 5) - hash) + pwd.charCodeAt(i)
    hash |= 0
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length]
}

export function getHostModelColor(hostModel: string): string {
  let hash = 2166136261
  for (let i = 0; i < hostModel.length; i++) {
    hash ^= hostModel.charCodeAt(i)
    hash = Math.imul(hash, 16777619) >>> 0
  }
  return AVATAR_COLORS[hash % AVATAR_COLORS.length]
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
  const hostModelColor = hostModel ? getHostModelColor(hostModel) : ""
  const messageLines = msg.split("\n")
  const contentWidth = Math.max(40, termWidth - 4)
  const wrappedEstimate = messageLines.reduce(
    (sum, line) => sum + Math.max(1, Math.ceil(line.length / contentWidth)),
    0,
  )
  const cardHeight = 4 + wrappedEstimate

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
        <box flexDirection="row" width="100%" flexShrink={1} overflow="hidden">
          <box backgroundColor={avatarColor} flexShrink={0}>
            <text fg="#ffffff"> {avatarInitial} </text>
          </box>
          <text fg={theme.text} attributes={TextAttributes.BOLD} flexShrink={1} overflow="hidden"> {title}</text>
          {hostModel && (
            <box backgroundColor={hostModelColor} flexShrink={0}>
              <text fg="#ffffff"> @{hostModel} </text>
            </box>
          )}
          <text fg={theme.dim} flexShrink={0}>  {time}</text>
        </box>
        <text fg={theme.pwdText}>{truncate(pwd, 80)}</text>
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
