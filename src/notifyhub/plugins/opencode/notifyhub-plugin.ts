import type { Plugin } from "@opencode/plugin"
import { spawn } from "child_process"
import { readFileSync, statSync } from "fs"
import { homedir } from "os"
import { join } from "path"

type PluginContext = Plugin.Context
type Session = Awaited<ReturnType<PluginContext["session"]["get"]>>
type SessionMessage = Awaited<ReturnType<PluginContext["session"]["context"]>>[number]

const MAX_LINES = 5
const MAX_CHARS = 200
const MAX_CHARS_TOLERANCE = 8

// Mirrors python booleanify (github.com/lamnguyenx/booleanify) — the same truth table
// the NotifyHub CLI uses for NOTIFYHUB_CLI_ENABLED. `undefined` = unset, empty, or
// unparseable; the CLI remains the authority in those cases.
const BOOL_TRUE = new Set(["1", "on", "t", "true", "y", "yes"])
const BOOL_FALSE = new Set(["0", "off", "f", "false", "n", "no"])

function booleanify(value: string | undefined): boolean | undefined {
  if (value === undefined) return undefined
  const v = value.trim().toLowerCase()
  if (BOOL_TRUE.has(v)) return true
  if (BOOL_FALSE.has(v)) return false
  return undefined
}

function exportedEmpty(name: string): boolean {
  const value = process.env[name]
  return value !== undefined && value.trim() === ""
}

/**
 * True when notifications are muted: NOTIFYHUB_CLI_ENABLED resolves to an explicit
 * false, or host/port was exported as an empty string. Skipping the spawn saves a
 * python process start; the CLI applies the same rules when invoked directly.
 */
function notificationsMuted(): boolean {
  if (booleanify(process.env.NOTIFYHUB_CLI_ENABLED) === false) return true
  return exportedEmpty("NOTIFYHUB_CLI_HOST") || exportedEmpty("NOTIFYHUB_CLI_PORT")
}

// Agents that are raw model-completion endpoints rather than user-facing chats.
// The Midscene AndroidWorld benchmark creates every model call with the `empty`
// agent (no tools, stub system prompt; see call-opencode.ts), so those turns
// must not notify while real chats sharing the same server still do. The list is
// read live from `plugins.opencode.muted_agents` in the NotifyHub config
// (~/.config/notifyhub/config.{json,jsonl}); NOTIFYHUB_PLUGINS_OPENCODE_MUTED_AGENTS
// overrides it, mirroring confstack's file-then-env layering.
const NOTIFYHUB_CONFIG_DIR = join(homedir(), ".config", "notifyhub")
const NOTIFYHUB_CONFIG_FILES = ["config.json", "config.jsonl"]
const DEFAULT_MUTED_AGENTS = ["empty"]

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function deepMerge(target: Record<string, unknown>, source: Record<string, unknown>): void {
  for (const [key, value] of Object.entries(source)) {
    const existing = target[key]
    if (isRecord(existing) && isRecord(value)) deepMerge(existing, value)
    else target[key] = value
  }
}

/**
 * Strip line (`//`) and block comments, which confstack's json5 parser accepts in
 * `.jsonl` config files (the shipped config.jsonl uses them). String contents are
 * preserved so URLs and escaped quotes are left intact.
 */
function stripJsonComments(text: string): string {
  let out = ""
  let inString = false
  let quote = ""
  let i = 0
  while (i < text.length) {
    const ch = text[i]
    if (inString) {
      out += ch
      if (ch === "\\" && i + 1 < text.length) {
        out += text[i + 1]
        i += 2
        continue
      }
      if (ch === quote) inString = false
      i += 1
      continue
    }
    if (ch === '"' || ch === "'") {
      inString = true
      quote = ch
      out += ch
      i += 1
      continue
    }
    if (ch === "/" && text[i + 1] === "/") {
      i += 2
      while (i < text.length && text[i] !== "\n") i += 1
      continue
    }
    if (ch === "/" && text[i + 1] === "*") {
      i += 2
      while (i < text.length && !(text[i] === "*" && text[i + 1] === "/")) i += 1
      i += 2
      continue
    }
    out += ch
    i += 1
  }
  return out
}

function stripTrailingCommas(text: string): string {
  let out = ""
  let inString = false
  let quote = ""
  let i = 0
  while (i < text.length) {
    const ch = text[i]
    if (inString) {
      out += ch
      if (ch === "\\" && i + 1 < text.length) {
        out += text[i + 1]
        i += 2
        continue
      }
      if (ch === quote) inString = false
      i += 1
      continue
    }
    if (ch === '"' || ch === "'") {
      inString = true
      quote = ch
      out += ch
      i += 1
      continue
    }
    if (ch === ",") {
      let j = i + 1
      while (j < text.length && /\s/.test(text[j])) j += 1
      if (j < text.length && (text[j] === "}" || text[j] === "]")) {
        i += 1
        continue
      }
    }
    out += ch
    i += 1
  }
  return out
}

function parseConfigContent(raw: string): Record<string, unknown> | undefined {
  const normalized = stripTrailingCommas(stripJsonComments(raw))
  try {
    const whole = JSON.parse(normalized)
    if (isRecord(whole)) return whole
  } catch {
    // Not a single JSON value — fall through to line-by-line handling below.
  }
  // `.jsonl` may instead hold one JSON object per line; merge them like confstack.
  const merged: Record<string, unknown> = {}
  let found = false
  for (const line of normalized.split("\n")) {
    const trimmed = line.trim()
    if (!trimmed) continue
    deepMerge(merged, JSON.parse(trimmed))
    found = true
  }
  return found ? merged : undefined
}

function readConfigObject(): Record<string, unknown> | undefined {
  for (const name of NOTIFYHUB_CONFIG_FILES) {
    const path = join(NOTIFYHUB_CONFIG_DIR, name)
    let raw: string
    try {
      raw = readFileSync(path, "utf8")
    } catch {
      continue
    }
    try {
      const parsed = parseConfigContent(raw)
      if (parsed) return parsed
    } catch (error) {
      console.error(`NotifyHub plugin could not parse ${path}: ${error}`)
      return undefined
    }
  }
  return undefined
}

function configuredMutedAgents(): string[] | undefined {
  const config = readConfigObject()
  const plugins = config?.plugins
  if (!isRecord(plugins)) return undefined
  const opencode = plugins.opencode
  if (!isRecord(opencode)) return undefined
  const value = opencode.muted_agents
  if (!Array.isArray(value)) return undefined
  return value
    .filter((entry): entry is string => typeof entry === "string")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0)
}

function mutedAgents(): Set<string> {
  const raw = process.env.NOTIFYHUB_PLUGINS_OPENCODE_MUTED_AGENTS
  const values = raw === undefined ? configuredMutedAgents() ?? DEFAULT_MUTED_AGENTS : raw.split(",")
  return new Set(
    values.map((value) => value.trim()).filter((value) => value.length > 0),
  )
}

function sessionMuted(agent: string | undefined): boolean {
  return agent !== undefined && mutedAgents().has(agent)
}

function existingDirectory(path?: string): string | undefined {
  if (!path) return undefined
  try {
    return statSync(path).isDirectory() ? path : undefined
  } catch {
    return undefined
  }
}

/**
 * Resolve the directory a notification belongs to, or `undefined` when this plugin instance
 * should ignore the event.
 *
 * The plugin is installed in the global config directory, so OpenCode loads one instance per open
 * location and every instance receives the shared server event stream. Without this check each
 * event notifies once per location, and instances other than the session's own fall back to their
 * own location directory (for a background `opencode serve` that is often ~). Only the instance
 * whose location matches the session handles it, and the session's real directory (plus any
 * worktree subpath) becomes the notification "pwd".
 */
async function ownedSessionDirectory(ctx: PluginContext, sessionID: string): Promise<string | undefined> {
  let session: Session
  try {
    session = await ctx.session.get({ sessionID })
  } catch (error) {
    console.error(`NotifyHub plugin could not resolve session ${sessionID}: ${error}`)
    return undefined
  }
  if (session.location.directory !== ctx.location.directory) return undefined
  if (sessionMuted(session.agent)) return undefined
  return session.subpath ? join(session.location.directory, session.subpath) : session.location.directory
}

function notifyhubPush(message: string, directory?: string): void {
  if (notificationsMuted()) return
  const notifyhubPush =
    process.env.NOTIFYHUB_PUSH_SCRIPT ?? join(homedir(), ".config", "opencode", "plugin", "notifyhub-push.py")
  // The push script reports its own os.getcwd() as the notification "pwd". Without an explicit
  // cwd the child inherits the OpenCode server's cwd (for a background `opencode serve` that is
  // often ~), so every notification claims the home directory. Run it in the session's directory
  // instead so "pwd" reflects the real project.
  const cwd = existingDirectory(directory)
  const child = spawn(
    notifyhubPush,
    [message],
    {
      stdio: "inherit",
      cwd,
      env: {
        NOTIFYHUB_CLI_HOST: process.env.NOTIFYHUB_CLI_HOST ?? "0.0.0.0",
        NOTIFYHUB_CLI_PORT: process.env.NOTIFYHUB_CLI_PORT ?? "9080",
        VERBOSE_INT: "0",
        ...process.env,
      },
    },
  )
  child.on("close", (code) => {
    if (code !== 0) {
      console.error(`NotifyHub notification failed: exit code ${code}`)
    }
  })
  child.on("error", (error) => {
    console.error(`NotifyHub notification error: ${error}`)
  })
}

// Mirrors the truncation rules of the retired opencode-trace.py --notifyhub preset.
export function truncateText(texts: string[]): string {
  if (texts.length === 0) return ""

  const lines = texts.join("\n").split("\n")
  const originalLines = lines.length
  const keptLines = lines.slice(-MAX_LINES)
  const truncatedLines = Math.max(0, originalLines - keptLines.length)

  let cleaned = keptLines.join("\n").replace(/\n+$/, "")
  const originalCleanedLength = cleaned.length

  if (cleaned.length > MAX_CHARS) {
    const target = cleaned.length - MAX_CHARS
    const searchEnd = Math.min(cleaned.length, target + MAX_CHARS_TOLERANCE)
    let snap = -1
    for (let i = target; i < searchEnd; i++) {
      if (cleaned[i] === " " || cleaned[i] === "\n") {
        snap = i
        break
      }
    }
    cleaned = snap >= 0 ? cleaned.slice(snap + 1).replace(/^[ \n]+/, "") : cleaned.slice(-MAX_CHARS)
  }

  const truncatedChars = Math.max(0, originalCleanedLength - cleaned.length)
  const prefix =
    (truncatedLines > 0 ? `[#truncated:+${truncatedLines} LINES]` : "") +
    (truncatedChars > 0 ? `[#truncated:+${truncatedChars} CHARS]` : "")
  return (prefix + cleaned).trim()
}

function lastUserText(messages: SessionMessage[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i]
    if (message.type === "user") return message.text
  }
  return ""
}

function lastAssistantTexts(messages: SessionMessage[]): string[] {
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i]
    if (message.type !== "assistant") continue
    return message.content.flatMap((part) => (part.type === "text" ? [part.text] : []))
  }
  return []
}

function notificationBody(messages: SessionMessage[]): string {
  const userText = lastUserText(messages)
  const user = userText ? truncateText([userText]) : ""
  const assistant = truncateText(lastAssistantTexts(messages))
  return `[#tag:@USER] ${user}\n[#tag:@ASSISTANT] ${assistant}`
}

const plugin: Plugin.Plugin = {
  id: "notifyhub",
  setup: async (ctx) => {
    const controller = new AbortController()

    const subscription = (async () => {
      for await (const event of ctx.event.subscribe({ signal: controller.signal })) {
        try {
          switch (event.type) {
            case "session.execution.succeeded":
            case "session.execution.interrupted": {
              const directory = await ownedSessionDirectory(ctx, event.data.sessionID)
              if (!directory) break
              const messages = await ctx.session.context({ sessionID: event.data.sessionID })
              notifyhubPush(notificationBody(messages), directory)
              break
            }
            case "session.execution.failed": {
              const directory = await ownedSessionDirectory(ctx, event.data.sessionID)
              if (!directory) break
              notifyhubPush(`[#opencode.error] ${event.data.error.message}`, directory)
              break
            }
            case "permission.asked": {
              const directory = await ownedSessionDirectory(ctx, event.data.sessionID)
              if (!directory) break
              notifyhubPush("[#opencode.permission] OpenCode needs your permission", directory)
              break
            }
            case "form.created": {
              const directory = await ownedSessionDirectory(ctx, event.data.form.sessionID)
              if (!directory) break
              notifyhubPush("[#opencode.question] OpenCode is asking you a question", directory)
              break
            }
          }
        } catch (error) {
          console.error(`NotifyHub plugin event error (${event.type}): ${error}`)
        }
      }
    })()

    subscription.catch((error) => {
      if (!controller.signal.aborted) {
        console.error(`NotifyHub plugin subscription error: ${error}`)
      }
    })

    return () => controller.abort()
  },
}

export default plugin
