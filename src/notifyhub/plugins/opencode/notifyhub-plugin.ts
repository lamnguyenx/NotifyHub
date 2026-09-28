import type { Plugin } from "@opencode/plugin"
import { spawn } from "child_process"
import { statSync } from "fs"
import { homedir } from "os"
import { join } from "path"

type PluginContext = Plugin.Context
type Session = Awaited<ReturnType<PluginContext["session"]["get"]>>
type SessionMessage = Awaited<ReturnType<PluginContext["session"]["context"]>>[number]

const MAX_LINES = 5
const MAX_CHARS = 200
const MAX_CHARS_TOLERANCE = 8

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
  return session.subpath ? join(session.location.directory, session.subpath) : session.location.directory
}

function notifyhubPush(message: string, directory?: string): void {
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
