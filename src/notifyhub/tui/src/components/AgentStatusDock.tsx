import { useEffect, useState } from "react"
import { useTheme } from "../theme"
import type { AgentState, AgentStatusEntry } from "../types"
import { formatRelativeTime, getAvatarColor, getTitle } from "./NotificationRow"

const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"] as const
const SPINNER_INTERVAL_MS = 120
const STALE_AFTER_MS = 5 * 60 * 1000 // mirror backend.agent_status_stale_seconds

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
function effectiveState(entry: AgentStatusEntry, now: Date): AgentState {
  if (entry.state !== "running") return entry.state
  const updated = Date.parse(entry.updated)
  if (Number.isFinite(updated) && now.getTime() - updated > STALE_AFTER_MS) return "stale"
  return entry.state
}

const AGENT_GLYPH: Record<string, string> = {
  opencode: "◇",
  claude: "✳",
  codex: "◐",
}

interface RowProps {
  entry: AgentStatusEntry
  now: Date
}

export function AgentStatusRow({ entry, now }: RowProps) {
  const theme = useTheme()
  const state = effectiveState(entry, now)
  const spinner = useSpinner(state === "running")
  const title = getTitle(entry.pwd)
  const color = getAvatarColor(entry.pwd ?? entry.session_id)
  const glyph = AGENT_GLYPH[entry.agent] ?? "●"

  let marker = "●"
  let markerColor = theme.dim
  let label = entry.agent
  if (state === "running") {
    marker = spinner
    markerColor = theme.accent
  } else if (state === "blocked") {
    marker = "⚠"
    markerColor = theme.warning
    label = `${entry.agent} · waiting for you`
  } else if (state === "stale") {
    marker = "◼"
    markerColor = theme.warning
    label = `${entry.agent} · stalled?`
  }

  const elapsed = formatRelativeTime(entry.since, now)

  return (
    <box flexDirection="row" width="100%" marginBottom={0}>
      <text fg={markerColor}>{marker} </text>
      <text fg={color}>{`${glyph} ${label}`}</text>
      <text fg={theme.dim}>{` · ${title} · ${elapsed}`}</text>
    </box>
  )
}

interface Props {
  entries: AgentStatusEntry[]
  now: Date
}

/**
 * Live dock above the notification stream. Only sessions in motion are
 * shown; idle entries are hidden (their completion already rendered as a
 * notification row). Running rows resolve when the matching notification
 * arrives (data.session_id) or the state flips to idle.
 */
export function AgentStatusDock({ entries, now }: Props) {
  const theme = useTheme()
  const live = entries
    .filter((e) => e.state !== "idle")
    .sort((a, b) => Date.parse(b.updated) - Date.parse(a.updated))
  if (live.length === 0) return null

  return (
    <box
      width="100%"
      flexDirection="column"
      flexShrink={0}
      borderStyle="single"
      borderColor={theme.border}
      paddingX={1}
      marginBottom={1}
    >
      {live.map((entry) => (
        <AgentStatusRow key={`${entry.agent}:${entry.session_id}`} entry={entry} now={now} />
      ))}
    </box>
  )
}
