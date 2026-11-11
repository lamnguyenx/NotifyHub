import { useEffect, useState } from "react"
import { TextAttributes } from "@opentui/core"
import { useTheme, type Theme } from "../theme"
import type { AgentState, AgentStatusEntry } from "../types"
import {
  formatRelativeTime,
  getAvatarColor,
  getHostModelTagColor,
  getTitle,
  mixHex,
  truncate,
} from "./NotificationRow"

const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"] as const
const SPINNER_INTERVAL_MS = 120
const STALE_AFTER_MS = 5 * 60 * 1000 // mirror backend.agent_status_stale_seconds
const CARD_TINT_RATIO = 0.1 // border color mixed into the card background
const LOADING_NEIGHBOR_RATIO = 0.45
/** Keep every word short enough to fit beside @ASSISTANT at 40 columns. */
const LOADING_WORDS = [
  "loading",
  "pondering",
  "noodling",
  "tinkering",
  "wrangling",
  "untangling",
  "conjuring",
  "hatching",
  "brewing",
  "scheming",
  "ruminating",
  "percolating",
  "rubber-ducking",
  "yak-shaving",
  "git-blaming",
  "bisecting",
  "grepping",
  "lint-whispering",
  "refactoring",
  "debugging",
  "vibing",
  "herding tokens",
  "asking the duck",
  "grepping the void",
  "chasing nulls",
  "consulting the void",
] as const

const AGENT_GLYPH: Record<string, string> = {
  opencode: "◇",
  claude: "✳",
  codex: "◐",
}

/** One-cell host/house marker; avoids the double-width monitor emoji. */
const HOST_GLYPH = "⌂"

/** One tick drives both the spinner glyph and the loading-word shimmer. */
function useTicker(active: boolean): number {
  const [tick, setTick] = useState(0)
  useEffect(() => {
    if (!active) return
    const id = setInterval(() => setTick((t) => t + 1), SPINNER_INTERVAL_MS)
    return () => clearInterval(id)
  }, [active])
  return tick
}

function hashSeed(seed: string): number {
  let hash = 2166136261
  for (let i = 0; i < seed.length; i++) {
    hash ^= seed.charCodeAt(i)
    hash = Math.imul(hash, 16777619) >>> 0
  }
  // Avalanche the FNV result so short seeds do not collide modulo the list.
  hash ^= hash >>> 16
  hash = Math.imul(hash, 0x7feb352d)
  hash ^= hash >>> 15
  hash = Math.imul(hash, 0x846ca68b)
  hash ^= hash >>> 16
  return hash >>> 0
}

/**
 * Pick one gerund per turn. The seed is the session + current task excerpt,
 * so the word stays put while the agent works and changes when a new prompt
 * starts — the Claude Code behaviour, not a fast carousel.
 */
export function loadingWordFor(seed: string): string {
  return LOADING_WORDS[hashSeed(seed) % LOADING_WORDS.length]
}

/**
 * A loading word with a highlight sweeping across its letters. The circular
 * distance makes the wave wrap from the last letter back to the first.
 */
function LoadingWord({ word, tick, theme }: { word: string; tick: number; theme: Theme }) {
  const head = tick % word.length
  return (
    <>
      {[...word].map((char, i) => {
        const direct = Math.abs(i - head)
        const distance = Math.min(direct, word.length - direct)
        const ratio = distance === 0 ? 1 : distance === 1 ? LOADING_NEIGHBOR_RATIO : 0
        return (
          <span key={i} fg={mixHex(theme.accent, theme.text, ratio)}>
            {char}
          </span>
        )
      })}
    </>
  )
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
    return { text: "stalled?", marker: "◼", color: theme.danger, markerColor: theme.danger }
  }
  return { text: "idle", marker: "", color: theme.dim, markerColor: theme.dim }
}

function cardBorderColor(state: AgentState, theme: Theme): string {
  if (state === "running") return theme.accent
  if (state === "blocked") return theme.warning
  if (state === "stale") return theme.danger
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
  const tick = useTicker(state === "running")
  const spinner = SPINNER_FRAMES[tick % SPINNER_FRAMES.length]
  const loadingWord = loadingWordFor(`${entry.session_id}:${entry.task?.trim() ?? ""}`)
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
  const borderColor = cardBorderColor(state, theme)
  const cardBackground = mixHex(borderColor, theme.background, CARD_TINT_RATIO)

  return (
    <box
      width="100%"
      flexShrink={0}
      borderStyle="rounded"
      borderColor={borderColor}
      backgroundColor={cardBackground}
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
        <box flexDirection="row" width="100%">
          <text fg={theme.accent} flexShrink={0}>@ASSISTANT</text>
          <box flexGrow={1} />
          <text fg={status.color} flexShrink={0}>
            {state === "running" ? <LoadingWord word={loadingWord} tick={tick} theme={theme} /> : status.text}
            {status.marker ? <span fg={status.markerColor}>{` ${status.marker}`}</span> : null}
          </text>
        </box>
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
    <box width="100%" flexDirection="column" flexShrink={0} gap={0} marginBottom={1}>
      {live.map((entry) => (
        <WaitingCard key={`${entry.agent}:${entry.session_id}`} entry={entry} now={now} />
      ))}
    </box>
  )
}
