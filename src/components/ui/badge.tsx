import { cn } from "@/lib/utils";
export function Badge({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border border-border px-2.5 py-1 text-[11px] font-medium tracking-wide text-muted-foreground",
        className,
      )}
    >
      {children}
    </span>
  );
}
export function StatusBadge({ status }: { status: string }) {
  return (
    <Badge
      className={cn(
        status === "Won" || status === "Qualified"
          ? "border-primary/25 bg-primary/8 text-primary"
          : status === "Suppressed" || status === "Lost"
            ? "border-red-400/25 text-red-300"
            : "",
      )}
    >
      <span className="size-1.5 rounded-full bg-current" />
      {status}
    </Badge>
  );
}
