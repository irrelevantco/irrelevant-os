import Link from "next/link";
import { requireContext } from "@/lib/context";
import type { Lead } from "@/lib/data";
import { PageHeading } from "@/components/page-heading";
import { Card } from "@/components/ui/card";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/input";
export const metadata = { title: "Research queue" };
export default async function Research({
  searchParams,
}: {
  searchParams: Promise<{ priority?: string; page?: string }>;
}) {
  const p = await searchParams;
  const page = Math.max(1, parseInt(p.page || "1") || 1);
  const priority = ["A", "B", "C"].includes(p.priority ?? "")
    ? p.priority!
    : "";
  const { db, organization } = await requireContext();
  let query = db
    .from("leads")
    .select("*, business:businesses!inner(*)", { count: "exact" })
    .eq("organization_id", organization.id)
    .not("status", "in", "(Won,Lost,Suppressed)");
  if (priority) query = query.eq("research_priority", priority);
  const { data, error, count } = await query
    .order("research_priority", { ascending: true, nullsFirst: false })
    .order("created_at")
    .range((page - 1) * 25, page * 25 - 1);
  if (error) throw new Error("Could not load research queue.");
  const leads = data as Lead[];
  return (
    <>
      <PageHeading
        eyebrow="Acquisition / Research"
        title="Evidence before assumptions."
        description="A priorities first, then B and C. These are supplied research priorities—not qualification scores, confirmed budgets, or evidence of digital weaknesses."
        action={
          <Button asChild variant="outline">
            <Link href="/dashboard/imports">Prospect imports</Link>
          </Button>
        }
      />
      <form className="mb-6 flex max-w-md items-center gap-3">
        <label htmlFor="research-priority" className="sr-only">
          Research priority
        </label>
        <Select id="research-priority" name="priority" defaultValue={priority}>
          <option value="">All priorities</option>
          {["A", "B", "C"].map((v) => (
            <option key={v}>{v}</option>
          ))}
        </Select>
        <Button variant="outline">Filter</Button>
      </form>
      <Card>
        <div className="divide-y divide-border">
          {leads.length ? (
            leads.map((lead) => (
              <article
                key={lead.id}
                className="flex flex-wrap items-start justify-between gap-4 p-5"
              >
                <div className="min-w-0 flex-1">
                  <div className="mb-3 flex flex-wrap items-center gap-2">
                    <Badge>Priority {lead.research_priority ?? "Unset"}</Badge>
                    <StatusBadge status={lead.status} />
                  </div>
                  <Link
                    href={`/dashboard/research/${lead.id}`}
                    className="text-base font-medium hover:text-primary"
                  >
                    {lead.business.name}
                  </Link>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {lead.business.industry} · {lead.business.location}
                  </p>
                  {lead.audit_hypothesis_not_verified && (
                    <p className="mt-3 text-xs leading-6 text-muted-foreground">
                      <span className="text-primary">
                        Unverified hypothesis:{" "}
                      </span>
                      {lead.audit_hypothesis_not_verified}
                    </p>
                  )}
                </div>
                <div className="flex gap-3 text-xs">
                  <Link
                    href={`/dashboard/research/${lead.id}`}
                    className="text-primary underline"
                  >
                    Growth Review
                  </Link>
                  <Link
                    href={`/dashboard/outreach/${lead.id}`}
                    className="text-muted-foreground underline"
                  >
                    Outreach draft
                  </Link>
                </div>
              </article>
            ))
          ) : (
            <p className="p-10 text-sm text-muted-foreground">
              No prospects in this queue. Import a batch or add a business to
              begin.
            </p>
          )}
        </div>
        <div className="flex items-center justify-between border-t border-border p-4 text-xs text-muted-foreground">
          <span>
            {count ?? 0} open prospects · Page {page}
          </span>
          <div className="flex gap-5">
            {page > 1 && (
              <Link href={`?priority=${priority}&page=${page - 1}`}>
                ← Previous
              </Link>
            )}
            {page * 25 < (count ?? 0) && (
              <Link href={`?priority=${priority}&page=${page + 1}`}>
                Next →
              </Link>
            )}
          </div>
        </div>
      </Card>
    </>
  );
}
