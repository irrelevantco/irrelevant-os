import Image from "next/image";

/** Shared, server-renderable loading artwork. No percentage until work is measurable. */
export function LoadingScreen({ startup = false }: { startup?: boolean }) {
  return (
    <div
      className={
        startup ? "loading-screen loading-screen-startup" : "loading-screen"
      }
    >
      <div className="loading-screen-content">
        <Image
          src="/brand-ir.svg"
          alt=""
          width={56}
          height={56}
          unoptimized
          className="loading-mark"
        />
        <p className="eyebrow mt-8 text-muted-foreground">iRRELEVANT OS</p>
        <p className="editorial mt-3 text-4xl sm:text-5xl">
          {startup ? "Build your position." : "Opening the next step."}
        </p>
        <div className="loading-rail mt-8" aria-hidden="true">
          <span />
        </div>
        <p className="mt-4 text-sm text-muted-foreground">
          {startup ? "Preparing your workspace…" : "Loading your workspace…"}
        </p>
      </div>
    </div>
  );
}
