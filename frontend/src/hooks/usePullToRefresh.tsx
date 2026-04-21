"use client";

import { useEffect, useRef } from "react";

export default function usePullToRefresh(onRefresh: () => any) {
  const startY = useRef<number | null>(null);
  const active = useRef(false);

  useEffect(() => {
    const onTouchStart = (e: TouchEvent) => {
      const scrollTop = document.scrollingElement?.scrollTop || 0;
      if (scrollTop === 0) {
        startY.current = e.touches[0].clientY;
      } else {
        startY.current = null;
      }
    };

    const onTouchMove = (e: TouchEvent) => {
      if (startY.current === null || active.current) return;
      const currentY = e.touches[0].clientY;
      const delta = currentY - (startY.current || 0);
      if (delta > 70) {
        active.current = true;
        try {
          const maybePromise = onRefresh();
          if (maybePromise && typeof (maybePromise as any).then === "function") {
            (maybePromise as Promise<any>).finally(() => {
              active.current = false;
            });
          } else {
            active.current = false;
          }
        } catch {
          active.current = false;
        }
      }
    };

    const onEnd = () => {
      startY.current = null;
      active.current = false;
    };

    window.addEventListener("touchstart", onTouchStart, { passive: true });
    window.addEventListener("touchmove", onTouchMove, { passive: true });
    window.addEventListener("touchend", onEnd);
    window.addEventListener("touchcancel", onEnd);

    return () => {
      window.removeEventListener("touchstart", onTouchStart);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("touchend", onEnd);
      window.removeEventListener("touchcancel", onEnd);
    };
  }, [onRefresh]);
}
