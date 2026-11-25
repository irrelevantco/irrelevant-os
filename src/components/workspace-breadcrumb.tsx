"use client";
import { usePathname } from "next/navigation";
import { workspaceLocation } from "@/lib/workspace-navigation";

export function WorkspaceBreadcrumb() {
  const location = workspaceLocation(usePathname());
  return (
    <nav
      aria-label="Current section"
      className="flex min-w-0 items-center gap-2 text-xs sm:text-sm"
    >
      <span className="hidden text-muted-foreground sm:inline">
        {location.group}
      </span>
      <span
        aria-hidden="true"
        className="hidden text-muted-foreground sm:inline"
      >
        /
      </span>
      <span className="truncate font-semibold" aria-current="page">
        {location.label}
      </span>
    </nav>
  );
}
