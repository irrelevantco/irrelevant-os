"use client";
import { useEffect } from "react";
export function AcquisitionRunner({ desktop }: { desktop: boolean }) {
  useEffect(() => {
    if (desktop) return;
    let stopped = false,
      running = false;
    const controller = new AbortController();
    async function tick() {
      if (stopped || running) return;
      running = true;
      try {
        await fetch("/api/automation/tick", {
          method: "POST",
          cache: "no-store",
          signal: controller.signal,
        });
      } catch {
      } finally {
        running = false;
      }
    }
    const timer = setInterval(tick, 60000);
    void tick();
    return () => {
      stopped = true;
      controller.abort();
      clearInterval(timer);
    };
  }, [desktop]);
  return null;
}
