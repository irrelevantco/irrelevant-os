"use client";

import { useLinkStatus } from "next/link";

/** Must remain inside a Next Link: the router owns pending, cancellation and completion. */
export function NavigationPending({ label }: { label: string }) {
  const { pending } = useLinkStatus();
  return (
    <span className="navigation-pending ml-auto" data-pending={pending}>
      <span className="navigation-pending-dot" aria-hidden="true" />
      <span className="sr-only" role="status">
        {pending ? `Opening ${label}…` : ""}
      </span>
    </span>
  );
}
