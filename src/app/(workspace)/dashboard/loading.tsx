export default function Loading() {
  return (
    <div
      role="status"
      aria-live="polite"
      className="workspace-page-enter py-16"
    >
      <div
        className="mb-7 flex size-10 items-center justify-center rounded bg-primary text-lg font-bold text-primary-foreground"
        aria-hidden="true"
      >
        iR
      </div>
      <p className="editorial text-3xl">Opening the next step.</p>
      <progress
        aria-label="Loading your workspace"
        className="mt-6 h-1 w-64 max-w-full accent-primary"
      />
      <p className="mt-4 text-sm text-muted-foreground">
        Loading your workspace…
      </p>
    </div>
  );
}
