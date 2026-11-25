"use client";

import { useEffect, useRef } from "react";
import { LoadingScreen } from "./loading-screen";

/** One splash per document, released by hydration, never by a pretend progress timer. */
export function StartupSplash() {
  const splash = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = splash.current;
    if (!element) return;
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    let animation: Animation | undefined;
    let frame = 0;
    const finish = () => {
      element.hidden = true;
      animation?.cancel();
    };
    // Paint the server-rendered splash before releasing it. Do not delay readiness.
    frame = requestAnimationFrame(() => {
      if (preference.matches || !element.animate) return finish();
      animation = element.animate([{ opacity: 1 }, { opacity: 0 }], {
        duration: 320,
        easing: "ease-out",
        fill: "forwards",
      });
      void animation.finished.then(finish, () => {});
    });
    const reduceMotion = () => {
      if (preference.matches) finish();
    };
    preference.addEventListener("change", reduceMotion);
    return () => {
      cancelAnimationFrame(frame);
      animation?.cancel();
      preference.removeEventListener("change", reduceMotion);
    };
  }, []);
  return (
    <div
      ref={splash}
      className="startup-splash"
      aria-hidden="true"
      data-startup-splash=""
    >
      <LoadingScreen startup />
    </div>
  );
}
