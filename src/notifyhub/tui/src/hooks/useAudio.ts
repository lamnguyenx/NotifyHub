import { useEffect, useRef, useCallback } from "react"
import { appendFileSync } from "node:fs"
import { Audio } from "@opentui/core"

const SOUND_DEBUG = !!process.env.NOTIFYHUB_TUI_SOUND_DEBUG?.trim()
const SOUND_LOG_PATH = process.env.NOTIFYHUB_TUI_SOUND_LOG?.trim()

/** Asset path resolved relative to this module, so callers need no path logic. */
const SOUND_PATH = (() => {
  try {
    return new URL("../../assets/Submarine.mp3", import.meta.url).pathname
  } catch {
    return ""
  }
})()

/**
 * Debug trail for the notification-sound path (SSE event → play decision →
 * audio voice). Off unless NOTIFYHUB_TUI_SOUND_DEBUG is set; logs to
 * NOTIFYHUB_TUI_SOUND_LOG when given, stderr otherwise.
 */
export function soundDebug(message: string): void {
  if (!SOUND_DEBUG) return
  const line = `[sounddbg ${new Date().toISOString()}] ${message}`
  if (SOUND_LOG_PATH) {
    try {
      appendFileSync(SOUND_LOG_PATH, line + "\n")
      return
    } catch {}
  }
  console.error(line)
}

export function useNotificationSound() {
  const audioRef = useRef<Audio | null>(null)
  const playRef = useRef<(() => void) | null>(null)

  useEffect(() => {
    try {
      const audio = Audio.create({ autoStart: true })
      audioRef.current = audio
      soundDebug(`audio: engine=${audio.isStarted() ? "started" : "not-started"} path=${SOUND_PATH}`)
      // `Audio` extends EventEmitter at runtime; the d.ts omits listener APIs.
      type ErrorListener = (error: Error, info: { action?: string; status?: number }) => void
      ;(audio as unknown as { on: (event: "error", listener: ErrorListener) => void }).on(
        "error",
        (error, info) => {
          soundDebug(`audio: error action=${info?.action} status=${info?.status} ${error?.message}`)
        },
      )

      audio.loadSoundFile(SOUND_PATH).then((loaded) => {
        if (loaded && audioRef.current) {
          playRef.current = () => {
            const voice = audioRef.current!.play(loaded, { volume: 1.0 })
            soundDebug(`play: soundId=${loaded} voice=${voice ?? "null(error)"}`)
          }
          soundDebug(`audio: loaded soundId=${loaded}`)
        } else {
          soundDebug("audio: load returned null (no playFn wired)")
        }
      }).catch((error) => {
        soundDebug(`audio: load rejected ${String(error)}`)
      })
    } catch (error) {
      soundDebug(`audio: create threw ${String(error)}`)
    }

    return () => {
      try { audioRef.current?.dispose() } catch {}
    }
  }, [])

  const play = useCallback(() => {
    try { playRef.current?.() } catch {}
  }, [])

  return play
}
