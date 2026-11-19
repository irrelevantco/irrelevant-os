"use client";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
export function WorkspaceTransition({
  children,
}: {
  children: React.ReactNode;
}) {
  const path = usePathname();
  const container = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    // Animate the existing container: changing its key also remounts live forms
    // and dialogs while the router is completing navigation.
    const animation = container.current?.animate(
      [{ opacity: 0, transform: "translateY(5px)" }, { opacity: 1, transform: "translateY(0)" }],
      { duration: 180, easing: "ease-out" },
    );
    return () => animation?.cancel();
  }, [path]);
  return (
    <div ref={container}>
      {children}
    </div>
  );
}
