import { useEffect, useRef, useCallback } from "react"
import { Audio } from "@opentui/core"

export function useNotificationSound(soundPath: string) {
  const audioRef = useRef<Audio | null>(null)
  const playRef = useRef<(() => void) | null>(null)

  useEffect(() => {
    try {
      const audio = Audio.create({ autoStart: true })
      audioRef.current = audio

      audio.loadSoundFile(soundPath).then((loaded) => {
        if (loaded && audioRef.current) {
          playRef.current = () => audioRef.current!.play(loaded, { volume: 0.5 })
        }
      }).catch(() => {})
    } catch {}

    return () => {
      try { audioRef.current?.dispose() } catch {}
    }
  }, [])

  const play = useCallback(() => {
    try { playRef.current?.() } catch {}
  }, [])

  return play
}
