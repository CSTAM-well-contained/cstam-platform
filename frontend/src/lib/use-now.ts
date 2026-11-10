import { useEffect, useState } from "react";

// useNow re-renders every `ms` so relative times and countdowns move between polls.
export function useNow(ms = 1000) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}
