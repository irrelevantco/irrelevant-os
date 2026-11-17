import Link from "next/link";
import { ArrowUpRight, Plus, UsersRound } from "lucide-react";
import type { Lead } from "@/lib/data";
import { money } from "@/lib/utils";
import { StatusBadge } from "./ui/badge";
import { Button } from "./ui/button";
export function LeadsTable({
  leads,
  filtered = false,
}: {
  leads: Lead[];
  filtered?: boolean;
}) {
  if (!leads.length)
    return (
      <div className="flex min-h-72 flex-col items-center justify-center px-6 py-12 text-center">
        <div className="mb-5 flex size-12 items-center justify-center rounded-full border border-border bg-secondary">
          <UsersRound
            className="size-5 text-muted-foreground"
            strokeWidth={1.3}
          />
        </div>
        <h3 className="text-base font-medium">
          {filtered
            ? "No businesses match."
            : "Your next opportunity starts here."}
        </h3>
        <p className="mt-2 max-w-sm text-sm leading-6 text-muted-foreground">
          {filtered
            ? "Try a different search or clear your filters."
            : "Add a business worth knowing. Build a focused pipeline, one good fit at a time."}
        </p>
        <Button asChild size="sm" className="mt-5">
          <Link href={filtered ? "/dashboard/leads" : "/dashboard/leads/new"}>
            {filtered ? (
              "Clear filters"
            ) : (
              <>
                <Plus />
                Add your first lead
              </>
            )}
          </Link>
        </Button>
      </div>
    );
  return (
    <div className="relative overflow-x-auto">
      <table className="w-full min-w-[720px] text-left text-sm">
        <thead className="border-b border-border bg-background/30 text-[10px] uppercase tracking-[.12em] text-muted-foreground">
          <tr>
            <th className="px-5 py-3.5 font-medium">Business</th>
            <th className="px-4 py-3.5 font-medium">Stage</th>
            <th className="px-4 py-3.5 font-medium">Est. value</th>
            <th className="px-4 py-3.5 font-medium">Follow-up</th>
            <th className="px-4 py-3.5">
              <span className="sr-only">Open lead</span>
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {leads.map((lead) => (
            <tr key={lead.id} className="group hover:bg-secondary/35">
              <td className="px-5 py-4">
                <Link
                  className="inline-flex items-center gap-3 focus-visible:rounded"
                  href={`/dashboard/leads/${lead.id}`}
                >
                  <span
                    className="flex size-9 shrink-0 items-center justify-center rounded border border-border bg-secondary text-xs font-medium text-foreground/70"
                    aria-hidden="true"
                  >
                    {lead.business.name.slice(0, 2).toUpperCase()}
                  </span>
                  <span>
                    <span className="block font-medium group-hover:text-primary">
                      {lead.business.name}
                    </span>
                    <span className="mt-1 block text-xs text-muted-foreground">
                      {lead.business.industry} · {lead.business.location}
                    </span>
                  </span>
                </Link>
              </td>
              <td className="px-4 py-4">
                <StatusBadge status={lead.status} />
              </td>
              <td className="px-4 py-4 tabular-nums">
                {lead.estimated_value_cents === null ? (
                  <span className="text-muted-foreground">—</span>
                ) : (
                  money(lead.estimated_value_cents)
                )}
              </td>
              <td className="px-4 py-4 text-xs text-muted-foreground">
                {lead.next_follow_up
                  ? new Intl.DateTimeFormat("en-US", {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                      timeZone: "UTC",
                    }).format(new Date(`${lead.next_follow_up}T12:00:00Z`))
                  : "Not scheduled"}
              </td>
              <td className="px-4 py-4">
                <Link
                  href={`/dashboard/leads/${lead.id}`}
                  aria-label={`Open ${lead.business.name}`}
                  className="text-muted-foreground hover:text-primary"
                >
                  <ArrowUpRight className="size-4" />
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
