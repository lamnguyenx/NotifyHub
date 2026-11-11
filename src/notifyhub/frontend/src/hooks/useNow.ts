import { useEffect, useState } from 'react';

/** Ticking clock shared by every card, so relative timestamps stay fresh. */
export function useNow(intervalMs = 10_000): Date {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);

  return now;
}
