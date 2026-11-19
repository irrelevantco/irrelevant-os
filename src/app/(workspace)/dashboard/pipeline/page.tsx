import Link from "next/link";
import { List, Plus, Trash2 } from "lucide-react";
import { pipelinePage } from "@/lib/pipeline-data";
import { requireContext } from "@/lib/context";
import { PageHeading } from "@/components/page-heading";
import { PipelineBoard } from "@/components/pipeline-board";
import { Button } from "@/components/ui/button";
import { DatabaseUpdate } from "@/components/database-update";
export const metadata = { title: "Pipeline" };
export default async function Pipeline({
  searchParams,
}: {
  searchParams: Promise<{ removed?: string }>;
}) {
  const [initial, { role }, params] = await Promise.all([
    pipelinePage().catch((error) => {
      if (
        error instanceof Error &&
        error.message === "PIPELINE_DATABASE_UPDATE"
      )
        return null;
      throw error;
    }),
    requireContext(),
    searchParams,
  ]);
  const canDelete = role === "owner";
  if (!initial) return <DatabaseUpdate />;
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
      <PipelineBoard
        key={`${initial.total}:${initial.groups.map((g) => g.leads[0]?.updated_at).join(":")}`}
        initial={initial}
        canDelete={canDelete}
      />
    </>
  );
}
