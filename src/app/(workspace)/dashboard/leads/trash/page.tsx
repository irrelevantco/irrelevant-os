import Link from "next/link";
import { redirect } from "next/navigation";
import { requireContext } from "@/lib/context";
import { missingDatabaseMigration } from "@/lib/database-failure";
import { trashListSchema } from "@/lib/lead-trash";
import { dateTime } from "@/lib/utils";
import { RestoreLeadButton } from "@/components/lead-actions";
import { DatabaseUpdate } from "@/components/database-update";
import { PageHeading } from "@/components/page-heading";
import { Card } from "@/components/ui/card";

export const metadata = { title: "Lead Trash" };
export default async function LeadTrash({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; restored?: string }>;
}) {
  const { db, organization, role } = await requireContext();
  if (role !== "owner") redirect("/dashboard/leads");
  const params = await searchParams;
  const page = Math.max(
    1,
    Math.min(100000, Number.parseInt(params.page || "1") || 1),
  );
  const { data, error } = await db.rpc("list_lead_trash", {
    org: organization.id,
    page,
  });
  if (missingDatabaseMigration(error)) return <DatabaseUpdate />;
  if (error) throw new Error("Could not load Trash. Please try again.");
  const trash = trashListSchema.parse(data);
  return (
    <>
      <PageHeading
        eyebrow="Acquisition / Trash"
        title="Room to reconsider."
        description="Removed leads stay out of the active CRM. Restore a lead with its history intact; cancelled preparation and email approvals do not resume."
        action={
          <Link
            className="text-sm text-primary underline"
            href="/dashboard/leads"
          >
            Back to leads
          </Link>
        }
      />
      {params.restored === "1" && (
        <p role="status" className="mb-5 text-sm text-primary">
          Lead restored. Its previous stage and history are retained. Review any
          next steps before preparing outreach.
        </p>
      )}
      <Card className="divide-y divide-border">
        {!trash.leads.length && (
          <p className="p-8 text-sm text-muted-foreground">
            {trash.count ? "No removed leads on this page." : "Trash is empty."}
          </p>
        )}
        {trash.leads.map((lead) => (
          <article
            key={lead.id}
            className="flex flex-wrap items-center justify-between gap-4 p-5"
          >
            <div className="min-w-0">
              <h2 className="break-words text-sm font-medium">
                {lead.business_name}
              </h2>
              <p className="mt-1 text-xs text-muted-foreground">
                {lead.status} · Removed {dateTime(lead.deleted_at)}
              </p>
            </div>
            <RestoreLeadButton id={lead.id} updatedAt={lead.updated_at} />
          </article>
        ))}
        <div className="flex flex-wrap items-center justify-between gap-3 p-4 text-xs text-muted-foreground">
          <span>
            {trash.count} removed leads · Page {page} of{" "}
            {Math.max(1, Math.ceil(trash.count / 25))}
          </span>
          <div className="flex gap-4">
            {page > 1 && (
              <Link href={`/dashboard/leads/trash?page=${page - 1}`}>
                ← Previous
              </Link>
            )}
            {page * 25 < trash.count && (
              <Link href={`/dashboard/leads/trash?page=${page + 1}`}>
                Next →
              </Link>
            )}
          </div>
        </div>
      </Card>
    </>
  );
}
