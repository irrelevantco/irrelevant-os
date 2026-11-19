"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
export function EngineRefresh() {
  const router = useRouter();
  useEffect(() => {
    const timer = setInterval(() => {
      if (!document.hidden && !document.querySelector("form:focus-within"))
        router.refresh();
    }, 15000);
    return () => clearInterval(timer);
  }, [router]);
  return null;
}
