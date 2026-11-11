import { TextAttributes } from "@opentui/core"
import { useTheme, type Theme } from "../theme"
import type { NotificationItem } from "../types"
import { isEnvelope, type EncryptedEnvelope } from "../utils/crypto"

export function envelopeKid(item: NotificationItem): string {
  return isEnvelope(item.data) ? String(item.data.kid ?? "?") : "?"
}

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

export const HOST_MODEL_DIM_RATIO = 0.4

function parseHex(hex: string): { r: number; g: number; b: number } {
  let h = hex.replace("#", "").trim()
  if (h.length === 3) {
    h = h.split("").map((c) => c + c).join("")
  }
  const num = parseInt(h, 16)
  return { r: (num >> 16) & 255, g: (num >> 8) & 255, b: num & 255 }
}

export function mixHex(a: string, b: string, ratio: number): string {
  const pa = parseHex(a)
  const pb = parseHex(b)
  const r = Math.round(pa.r * ratio + pb.r * (1 - ratio))
  const g = Math.round(pa.g * ratio + pb.g * (1 - ratio))
  const bl = Math.round(pa.b * ratio + pb.b * (1 - ratio))
  const toHex = (v: number) => v.toString(16).padStart(2, "0")
  return `#${toHex(r)}${toHex(g)}${toHex(bl)}`
}

export function getHostModelTagColor(hostModel: string, bg: string): string {
  return mixHex(getHostModelColor(hostModel), bg, HOST_MODEL_DIM_RATIO)
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
  /** Renderable id, so the stream can scroll the selected card into view. */
  id?: string
}

/** Human label for a truncation marker: "+24 LINES" -> "+24 lines". */
function truncatedLabel(text: string): string {
  return text.trim().toLowerCase()
}

function renderSegments(segments: TagSegment[], lineKey: string, theme: Theme) {
  const out = []
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i]
    const key = `${lineKey}-${seg.type}-${i}`
    if (seg.type === "tag") {
      out.push(<span key={key} fg={theme.accent}>{seg.text}</span>)
    } else if (seg.type === "truncated") {
      // Adjacent markers ("+24 LINES" "+517 CHARS") collapse into one
      // bracketed note, padded so it never glues onto the message text.
      const prev = segments[i - 1]
      const labels = [truncatedLabel(seg.text)]
      while (segments[i + 1]?.type === "truncated") {
        i++
        labels.push(truncatedLabel(segments[i].text))
      }
      const lead = prev && !/\s$/.test(prev.text) ? " " : ""
      out.push(<span key={key} fg={theme.truncatedText}>{`${lead}[${labels.join(", ")}] `}</span>)
    } else {
      // Avoid a double space after a marker that already pads itself.
      const prev = segments[i - 1]
      const text = prev?.type === "truncated" ? seg.text.replace(/^ /, "") : seg.text
      out.push(<span key={key}>{text}</span>)
    }
  }
  return out
}

function LockedNotificationRow({ item, selected, now, id }: Props) {
  const theme = useTheme()
  const kid = envelopeKid(item)
  const borderColor = selected ? theme.borderSelected : theme.border
  const cardBg = selected ? theme.surfaceSelected : theme.background
  return (
    <box
      id={id}
      width="100%"
      flexShrink={0}
      borderStyle="rounded"
      borderColor={borderColor}
      backgroundColor={cardBg}
      paddingX={1}
    >
      <box flexDirection="column" width="100%">
        <box flexDirection="row" width="100%">
          <text fg={theme.warning} attributes={TextAttributes.BOLD}> LOCKED</text>
          <box flexGrow={1} />
          <text fg={theme.dim}>{formatRelativeTime(item.timestamp, now)}</text>
        </box>
        <text fg={theme.dim}>encrypted notification (kid {kid})</text>
        <text fg={theme.dim}>set NOTIFYHUB_E2E_KEY to decrypt</text>
      </box>
    </box>
  )
}

/**
 * Dispatcher only: no hooks here. Each branch is its own component, so a
 * row switching between locked and plain never changes the hook order.
 */
export function NotificationRow(props: Props) {
  return props.item.locked ? <LockedNotificationRow {...props} /> : <PlainNotificationRow {...props} />
}

function PlainNotificationRow({ item, selected, now: propNow, id }: Props) {
  const now = propNow ?? new Date()
  const theme = useTheme()
  const data = (item.data ?? {}) as Record<string, unknown>
  const msg = typeof data.message === "string" ? data.message : ""
  const rawPwd = data.pwd
  const pwd = typeof rawPwd === "string" ? rawPwd : ""
  const rawHostModel = data.host_model
  const hostModel = typeof rawHostModel === "string" ? rawHostModel : ""
  const title = getTitle(pwd)
  const avatarColor = getAvatarColor(pwd)
  const avatarInitial = title[0]?.toUpperCase() || "N"
  const cardBg = selected ? theme.surfaceSelected : theme.background
  const borderColor = selected ? theme.borderSelected : theme.border
  const time = formatRelativeTime(item.timestamp, now)
  const hostModelColor = hostModel ? getHostModelTagColor(hostModel, cardBg) : ""
  // Drop trailing blank lines so cards don't end with empty padding.
  const messageLines = msg.replace(/\s+$/, "").split("\n")

  // No fixed height: Yoga measures the wrapped text, and flexShrink={0}
  // keeps the scrollbox from squashing cards to fit the viewport.
  return (
    <box
      id={id}
      width="100%"
      flexShrink={0}
      borderStyle="rounded"
      borderColor={borderColor}
      backgroundColor={cardBg}
      paddingX={1}
    >
      <box flexDirection="column" gap={0} width="100%">
        <box flexDirection="row" width="100%" overflow="hidden">
          <box backgroundColor={avatarColor} flexShrink={0}>
            <text fg="#ffffff"> {avatarInitial} </text>
          </box>
          <text fg={theme.text} attributes={TextAttributes.BOLD} flexShrink={1} wrapMode="none"> {title}</text>
          <box flexGrow={1} />
          {hostModel ? (
            <box backgroundColor={hostModelColor} flexShrink={0}>
              <text fg={theme.text}> {hostModel} </text>
            </box>
          ) : (
            <text fg={theme.dim} flexShrink={0}>{time}</text>
          )}
        </box>
        {hostModel && (
          <box flexDirection="row" width="100%">
            <box flexGrow={1} />
            <text fg={theme.dim} flexShrink={0}>{time}</text>
          </box>
        )}
        {pwd && <text fg={theme.pwdText} wrapMode="none">{truncate(pwd, 80)}</text>}
        {messageLines.map((line, lineIdx) => {
          const segments = parseMessage(line)
          return (
            <text key={`msg-ln-${lineIdx}`} fg={theme.text} selectable>
              {segments.length > 0
                ? renderSegments(segments, `ln${lineIdx}`, theme)
                : "\u00a0"}
            </text>
          )
        })}
      </box>
    </box>
  )
}
