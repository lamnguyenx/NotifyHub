import { TextAttributes } from "@opentui/core"
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
    "#7B1FA2", "#77919D", "#455A65", "#EC417A", "#C1175C",
    "#5D6AC0", "#0388D2", "#00579B", "#0098A7", "#00897B",
    "#004D40", "#68A039", "#EF6C00", "#F6511E", "#BE360B",
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

function parseAndTruncate(msg: string, max: number): TagSegment[] {
  const newlineIdx = msg.indexOf("\n")
  const line = newlineIdx >= 0 ? msg.slice(0, newlineIdx) : msg
  const segments = parseMessage(line)
  if (segments.length === 0) return [{ type: "text", text: msg.slice(0, max) }]

  let visibleLen = 0
  const result: TagSegment[] = []

  for (const seg of segments) {
    const remaining = max - visibleLen
    if (remaining <= 0) break

    if (seg.text.length <= remaining) {
      result.push(seg)
      visibleLen += seg.text.length
    } else {
      result.push({ ...seg, text: seg.text.slice(0, remaining) + "\u2026" })
      break
    }
  }

  return result
}

interface Props {
  item: NotificationItem
  selected?: boolean
}

export function NotificationRow({ item, selected }: Props) {
  const msg = item.data?.message ?? ""
  const pwd = item.data?.pwd ?? ""
  const title = getTitle(pwd)
  const avatarColor = getAvatarColor(pwd)
  const avatarInitial = title[0]?.toUpperCase() || "N"
  const cardBg = selected ? "#1e1e1e" : "#141414"
  const borderColor = selected ? "#555555" : "#2a2a2a"
  const time = formatTime(item.timestamp)
  const segments = parseAndTruncate(msg, 80)

  return (
    <box
      width="100%"
      height={5}
      borderStyle="rounded"
      borderColor={borderColor}
      backgroundColor={cardBg}
      paddingX={1}
      marginBottom={1}
    >
      <box flexDirection="column" gap={0} width="100%">
        <text>
          <span fg={avatarColor}>{avatarInitial}</span>
          <span fg="#ffffff" attributes={TextAttributes.BOLD}> {title}</span>
          <span fg="#999999">  {time}</span>
        </text>
        <text fg="#888888">{truncate(pwd, 80)}</text>
        <text fg="#d4d4d4" selectable>
          {segments.map((seg, i) => {
            const key = `${seg.type}-${i}-${seg.text.slice(0, 8)}`
            if (seg.type === "tag") {
              return <span key={key} fg="#aaaaaa">{seg.text}</span>
            }
            if (seg.type === "truncated") {
              return <span key={key} fg="#444444">{seg.text}</span>
            }
            return <span key={key}>{seg.text}</span>
          })}
        </text>
      </box>
    </box>
  )
}
