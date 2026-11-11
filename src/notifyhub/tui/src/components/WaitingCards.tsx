import { useEffect, useState } from "react"
import { TextAttributes } from "@opentui/core"
import { useTheme, type Theme } from "../theme"
import type { AgentState, AgentStatusEntry } from "../types"
import {
  formatRelativeTime,
  getAvatarColor,
  getHostModelTagColor,
  getTitle,
  truncate,
} from "./NotificationRow"

const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"] as const
const SPINNER_INTERVAL_MS = 120
const STALE_AFTER_MS = 5 * 60 * 1000 // mirror backend.agent_status_stale_seconds

const AGENT_GLYPH: Record<string, string> = {
  opencode: "◇",
  claude: "✳",
  codex: "◐",
}

/** One-cell host/house marker; avoids the double-width monitor emoji. */
const HOST_GLYPH = "⌂"

function useSpinner(active: boolean): string {
  const [frame, setFrame] = useState(0)
  useEffect(() => {
    if (!active) return
    const id = setInterval(() => setFrame((f) => (f + 1) % SPINNER_FRAMES.length), SPINNER_INTERVAL_MS)
    return () => clearInterval(id)
  }, [active])
  return SPINNER_FRAMES[frame]
}

/** Client-side staleness mirror: a running entry silent past the window. */
function effectiveAgentState(entry: AgentStatusEntry, now: Date): AgentState {
  if (entry.state !== "running") return entry.state
  const updated = Date.parse(entry.updated)
  if (Number.isFinite(updated) && now.getTime() - updated > STALE_AFTER_MS) return "stale"
  return entry.state
}

interface StatusLine {
  text: string
  marker: string
  color: string
  markerColor: string
}

function statusLine(state: AgentState, spinner: string, theme: Theme): StatusLine {
  if (state === "running") {
    return { text: "loading", marker: spinner, color: theme.text, markerColor: theme.accent }
  }
  if (state === "blocked") {
    return { text: "waiting for you", marker: "⚠", color: theme.warning, markerColor: theme.warning }
  }
  if (state === "stale") {
    return { text: "stalled?", marker: "◼", color: theme.warning, markerColor: theme.warning }
  }
  return { text: "idle", marker: "", color: theme.dim, markerColor: theme.dim }
}

function cardBorderColor(state: AgentState, theme: Theme): string {
  if (state === "running") return theme.accent
  if (state === "blocked" || state === "stale") return theme.warning
  return theme.border
}

interface CardProps {
  entry: AgentStatusEntry
  now: Date
}

/**
 * A notification card that has not arrived yet: same chrome as a real card,
 * but the body shows the running prompt (`@USER`) and a live `@ASSISTANT
 * loading` line instead of a completed reply.
 */
export function WaitingCard({ entry, now }: CardProps) {
  const theme = useTheme()
  const state = effectiveAgentState(entry, now)
  const spinner = useSpinner(state === "running")
  const pwd = entry.pwd ?? ""
  const title = getTitle(entry.pwd)
  const avatarColor = getAvatarColor(entry.pwd ?? entry.session_id)
  const avatarInitial = title[0]?.toUpperCase() || "N"
  const agent = entry.agent || "agent"
  const glyph = AGENT_GLYPH[agent] ?? "●"
  const agentBg = getHostModelTagColor(agent, theme.background)
  const host = entry.host?.trim() ?? ""
  const hostBg = host ? getHostModelTagColor(host, theme.background) : ""
  const elapsed = formatRelativeTime(entry.since, now)
  const task = entry.task?.trim() ?? ""
  const status = statusLine(state, spinner, theme)

  return (
    <box
      width="100%"
      flexShrink={0}
      borderStyle="rounded"
      borderColor={cardBorderColor(state, theme)}
      backgroundColor={theme.background}
      paddingX={1}
    >
      <box flexDirection="column" gap={0} width="100%">
        <box flexDirection="row" width="100%" overflow="hidden">
          <box backgroundColor={avatarColor} flexShrink={0}>
            <text fg="#ffffff"> {avatarInitial} </text>
          </box>
          <text fg={theme.text} attributes={TextAttributes.BOLD} flexShrink={1} wrapMode="none"> {title}</text>
          <box flexGrow={1} />
          <box backgroundColor={agentBg} flexShrink={0}>
            <text fg={theme.text}>{` ${glyph} ${agent} `}</text>
          </box>
          {host ? (
            <box backgroundColor={hostBg} flexShrink={0} marginLeft={1}>
              <text fg={theme.text}>{` ${HOST_GLYPH} ${truncate(host, 24)} `}</text>
            </box>
          ) : null}
        </box>
        <box flexDirection="row" width="100%">
          <box flexGrow={1} />
          <text fg={theme.dim} flexShrink={0}>{elapsed}</text>
        </box>
        {pwd && <text fg={theme.pwdText} wrapMode="none">{truncate(pwd, 80)}</text>}
        <text fg={theme.text}>
          <span fg={theme.accent}>@USER</span>
          {task ? ` ${task}` : <span fg={theme.dim}>{" (no task excerpt)"}</span>}
        </text>
        <text fg={theme.text}>
          <span fg={theme.accent}>@ASSISTANT</span>
          <span fg={status.color}>{` ${status.text}`}</span>
          {status.marker ? <span fg={status.markerColor}>{` ${status.marker}`}</span> : null}
        </text>
      </box>
    </box>
  )
}

interface Props {
  entries: AgentStatusEntry[]
  now: Date
}

/**
 * Waiting cards above the notification stream. Only sessions in motion are
 * shown; idle entries are hidden (their completion already rendered as a
 * notification row). Running cards resolve when the matching notification
 * arrives (data.session_id) or the state flips to idle.
 */
export function WaitingCards({ entries, now }: Props) {
  const live = entries
    .filter((e) => e.state !== "idle")
    .sort((a, b) => Date.parse(b.updated) - Date.parse(a.updated))
  if (live.length === 0) return null

  return (
    <box width="100%" flexDirection="column" flexShrink={0} gap={1} marginBottom={1}>
      {live.map((entry) => (
        <WaitingCard key={`${entry.agent}:${entry.session_id}`} entry={entry} now={now} />
      ))}
    </box>
  )
}
