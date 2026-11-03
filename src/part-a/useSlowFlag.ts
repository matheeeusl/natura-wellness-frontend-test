import { useEffect, useState } from "react";

const SLOW_AFTER_MS = 1500;

/** True once `active` has stayed true long enough to tell the customer about the wait. */
export function useSlowFlag(active: boolean) {
  const [slow, setSlow] = useState(false);

  useEffect(() => {
    if (!active) return;
    const timer = setTimeout(() => setSlow(true), SLOW_AFTER_MS);
    return () => {
      clearTimeout(timer);
      setSlow(false);
    };
  }, [active]);

  return active && slow;
}
