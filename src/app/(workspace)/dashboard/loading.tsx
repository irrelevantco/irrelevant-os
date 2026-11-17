export default function Loading() {
  return (
    <div
      role="status"
      aria-live="polite"
      className="py-20 text-sm text-muted-foreground"
    >
      Loading your workspace…
    </div>
  );
}
