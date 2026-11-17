import Link from "next/link";
import { Activity } from "lucide-react";
import { requireContext } from "@/lib/context";
import { dateTime } from "@/lib/utils";
import { PageHeading } from "@/components/page-heading";
import { Card } from "@/components/ui/card";
export const metadata = { title: "Activity" };
export default async function ActivityPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const { db, organization, user } = await requireContext();
  const p = await searchParams;
  const page = Math.max(1, Math.min(100000, parseInt(p.page || "1") || 1));
  const { data, error, count } = await db
    .from("audit_events")
    .select("*", { count: "exact" })
    .eq("organization_id", organization.id)
    .order("created_at", { ascending: false })
    .range((page - 1) * 30, page * 30 - 1);
  if (error) throw new Error("Could not load workspace activity.");
  return (
    <>
      <PageHeading
        eyebrow="Workspace / History"
        title="Every move, accounted for."
        description="An append-only record of organization, business, lead, and note changes."
      />
      <Card>
        <div className="divide-y divide-border">
          {data?.length ? (
            data.map((event) => (
              <article key={event.id} className="flex items-start gap-4 p-5">
                <div className="flex size-9 shrink-0 items-center justify-center rounded-full border border-border bg-secondary">
                  <Activity className="size-4 text-muted-foreground" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm">
                    <span className="font-medium">
                      {event.actor_id === user.id
                        ? "You"
                        : event.actor_id
                          ? `Member ${event.actor_id.slice(0, 8)}`
                          : "System"}
                    </span>{" "}
                    {event.action === "insert" ? "created" : "updated"}{" "}
                    {event.entity_type === "lead_notes"
                      ? "a lead note"
                      : event.entity_type === "organizations"
                        ? "an organization"
                        : event.entity_type === "businesses"
                          ? "a business"
                          : "a lead"}
                  </p>
                  <p className="mt-1 break-words text-xs text-muted-foreground">
                    {event.changed_fields.length
                      ? `Changed: ${event.changed_fields.join(", ")}`
                      : `Record ${event.entity_id.slice(0, 8)}`}{" "}
                    · {dateTime(event.created_at)}
                  </p>
                </div>
              </article>
            ))
          ) : (
            <p className="p-10 text-sm text-muted-foreground">
              No activity recorded yet.
            </p>
          )}
        </div>
        <div className="flex items-center justify-between border-t border-border p-4 text-xs text-muted-foreground">
          <span>
            {count ?? 0} events · Page {page}
          </span>
          <div className="flex gap-5">
            {page > 1 && (
              <Link href={`?page=${page - 1}`} className="hover:text-primary">
                ← Previous
              </Link>
            )}
            {page * 30 < (count ?? 0) && (
              <Link href={`?page=${page + 1}`} className="hover:text-primary">
                Next →
              </Link>
            )}
          </div>
        </div>
      </Card>
    </>
  );
}
