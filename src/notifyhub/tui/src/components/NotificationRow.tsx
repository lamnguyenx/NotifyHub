import { TextAttributes } from "@opentui/core"
import { useTerminalDimensions } from "@opentui/react"
import type { NotificationItem } from "../types"

function formatTime(iso: string): string {
  try {
    const d = new Date(iso)
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
  } catch {
    return iso
  }
}

function getAvatarColor(pwd: string): string {
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

function getTitle(pwd: string | undefined | null): string {
  if (!pwd) return "notifyhub"
  const parts = pwd.split("/").filter(Boolean)
  return parts.pop() || "notifyhub"
}

function truncate(str: string, max: number): string {
  if (str.length <= max) return str
  return str.slice(0, max - 1) + "\u2026"
}

interface TagSegment {
  type: "text" | "tag" | "truncated"
  text: string
}

function parseMessage(msg: string): TagSegment[] {
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
}

function renderSegments(segments: TagSegment[], lineKey: string) {
  return segments.map((seg, i) => {
    const key = `${lineKey}-${seg.type}-${i}-${seg.text.slice(0, 8)}`
    if (seg.type === "tag") {
      return <span key={key} fg="#6fc3df">{seg.text}</span>
    }
    if (seg.type === "truncated") {
      return <span key={key} fg="#505050">{seg.text}</span>
    }
    return <span key={key}>{seg.text}</span>
  })
}

export function NotificationRow({ item, selected }: Props) {
  const { width: termWidth } = useTerminalDimensions()
  const msg = item.data?.message ?? ""
  const pwd = item.data?.pwd ?? ""
  const title = getTitle(pwd)
  const avatarColor = getAvatarColor(pwd)
  const avatarInitial = title[0]?.toUpperCase() || "N"
  const cardBg = selected ? "#2a2a2a" : "#000000"
  const borderColor = selected ? "#6fc3df" : "#ffffff"
  const time = formatTime(item.timestamp)
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
        <text>
          <span bg={avatarColor} fg="#ffffff"> {avatarInitial} </span>
          <span fg="#ffffff" attributes={TextAttributes.BOLD}> {title}</span>
          <span fg="#969696">  {time}</span>
        </text>
        <text fg="#a0a0a0">{truncate(pwd, 80)}</text>
        {messageLines.map((line, lineIdx) => {
          const segments = parseMessage(line)
          return (
            <text key={`msg-ln-${lineIdx}`} fg="#ffffff" selectable>
              {segments.length > 0
                ? renderSegments(segments, `ln${lineIdx}`)
                : (line || "\u00a0")}
            </text>
          )
        })}
      </box>
    </box>
  )
}
