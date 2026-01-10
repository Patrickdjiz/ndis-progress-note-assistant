// src/lib/useIsMobile.js
import { useEffect, useState } from "react";

export function useIsMobile(maxWidth = 760) {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;

    const mq = window.matchMedia(`(max-width: ${maxWidth}px)`);

    const apply = () => setIsMobile(!!mq.matches);
    apply();

    if (mq.addEventListener) {
      mq.addEventListener("change", apply);
      return () => mq.removeEventListener("change", apply);
    } else {
      // older Safari
      mq.addListener(apply);
      return () => mq.removeListener(apply);
    }
  }, [maxWidth]);

  return isMobile;
}
