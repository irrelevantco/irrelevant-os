import Link from "next/link";
import { List, Plus, Trash2 } from "lucide-react";
import { getLeads, getSummary } from "@/lib/data";
import { PageHeading } from "@/components/page-heading";
import { PipelineBoard } from "@/components/pipeline-board";
import { Button } from "@/components/ui/button";
export const metadata = { title: "Pipeline" };
export default async function Pipeline({
  searchParams,
}: {
  searchParams: Promise<{ removed?: string }>;
}) {
  const [{ leads, count, canDelete }, summary, params] = await Promise.all([
    getLeads({ limit: 500 }),
    getSummary(),
    searchParams,
  ]);
  return (
    <>
      <PageHeading
        eyebrow="Acquisition / Pipeline"
        title="Progress, in perspective."
        description="Stages run top to bottom. Expand a stage, search, or jump straight to the work that matters."
        action={
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline">
              <Link href="/dashboard/leads">
                <List />
                Table
              </Link>
            </Button>
            {canDelete && (
              <Button asChild variant="outline">
                <Link href="/dashboard/leads/trash">
                  <Trash2 />
                  Trash
                </Link>
              </Button>
            )}
            <Button asChild>
              <Link href="/dashboard/leads/new">
                <Plus />
                Add business
              </Link>
            </Button>
          </div>
        }
      />
      {params.removed === "1" && (
        <p role="status" className="mb-5 text-sm text-primary">
          Lead moved to Trash. Queued work was cancelled.{" "}
          <Link className="underline" href="/dashboard/leads/trash">
            View Trash
          </Link>
        </p>
      )}
      {count > 500 && (
        <p role="status" className="mb-5 text-sm text-primary">
          Showing the 500 most recently updated leads. Stage totals include all
          active leads; use the table to search the full pipeline.
        </p>
      )}
      <PipelineBoard
        leads={leads.map(
          ({
            id,
            status,
            updated_at,
            estimated_value_cents,
            next_follow_up,
            business,
          }) => ({
            id,
            status,
            updated_at,
            estimated_value_cents,
            next_follow_up,
            business: {
              name: business.name,
              industry: business.industry,
              location: business.location,
            },
          }),
        )}
        totals={summary.by_status}
        canDelete={canDelete}
      />
    </>
  );
}
