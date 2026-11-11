import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Notification sound with the browser-autoplay fallback: when play() is
 * blocked, expose `blocked` so the shell can show the click-to-enable banner.
 */
export function useAudio(src: string, volume = 0.5) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [blocked, setBlocked] = useState(false);

  useEffect(() => {
    const audio = new Audio(src);
    audio.volume = volume;
    audio.load();
    audioRef.current = audio;
    return () => {
      audio.pause();
      audioRef.current = null;
    };
  }, [src, volume]);

  const play = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = 0;
    audio.play().catch(() => setBlocked(true));
  }, []);

  useEffect(() => {
    if (!blocked) return;
    const enable = () => {
      const audio = audioRef.current;
      if (!audio) return;
      audio.play()
        .then(() => {
          setBlocked(false);
          document.removeEventListener('click', enable);
        })
        .catch(() => {
          // Still blocked; keep listening.
        });
    };
    document.addEventListener('click', enable);
    return () => document.removeEventListener('click', enable);
  }, [blocked]);

  return { play, blocked };
}
