import Link from "next/link";
import { requireContext } from "@/lib/context";
import { PageHeading } from "@/components/page-heading";
import { Card } from "@/components/ui/card";
import { StatusBadge, Badge } from "@/components/ui/badge";
import type { Lead } from "@/lib/data";
export const metadata = { title: "Outreach preparation" };
export default async function Outreach() {
  const { db, organization } = await requireContext();
  const { data, error } = await db
    .from("leads")
    .select("*,business:businesses!inner(*)")
    .eq("organization_id", organization.id)
    .order("updated_at", { ascending: false })
    .limit(100);
  if (error) throw new Error("Could not load outreach preparation.");
  return (
    <>
      <PageHeading
        eyebrow="Acquisition / Preparation"
        title="Start a thoughtful conversation."
        description="Every message here is a draft. Review approval only marks research ready; it never sends or authorizes an email."
      />
      <Card className="divide-y divide-border">
        {(data as Lead[]).map((lead) => (
          <Link
            key={lead.id}
            href={`/dashboard/outreach/${lead.id}`}
            className="flex flex-wrap items-center justify-between gap-4 p-5 hover:bg-secondary/30"
          >
            <div>
              <p className="text-sm font-medium">{lead.business.name}</p>
              <p className="mt-2 text-xs text-muted-foreground">
                {lead.business.email ?? "Email not recorded"} ·{" "}
                {lead.business.phone ?? "Phone not recorded"}
              </p>
            </div>
            <div className="flex gap-2">
              <StatusBadge status={lead.status} />
              <Badge>Draft only</Badge>
            </div>
          </Link>
        ))}
        {!data.length && (
          <p className="p-8 text-sm text-muted-foreground">
            No leads yet. Add or import businesses to prepare outreach.
          </p>
        )}
      </Card>
      <p className="mt-4 text-xs text-muted-foreground">
        Showing the 100 most recently updated leads. Use the CRM or research
        queue to open older records.
      </p>
    </>
  );
}
