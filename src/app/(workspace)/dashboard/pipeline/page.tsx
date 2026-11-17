import Link from "next/link";
import { ArrowUpRight, List, Plus } from "lucide-react";
import { getLeads, getSummary } from "@/lib/data";
import { STATUSES } from "@/lib/domain";
import { money } from "@/lib/utils";
import { PageHeading } from "@/components/page-heading";
import { Button } from "@/components/ui/button";
export const metadata = { title: "Pipeline" };
export default async function Pipeline() {
  const [{ leads, count }, summary] = await Promise.all([
    getLeads({ limit: 500 }),
    getSummary(),
  ]);
  return (
    <>
      <PageHeading
        eyebrow="Acquisition / Pipeline"
        title="Progress, in perspective."
        description="Follow each relationship from first discovery to a decision. Open a card to update its stage."
        action={
          <div className="flex gap-2">
            <Button asChild variant="outline">
              <Link href="/dashboard/leads">
                <List />
                Table
              </Link>
            </Button>
            <Button asChild>
              <Link href="/dashboard/leads/new">
                <Plus />
                Add business
              </Link>
            </Button>
          </div>
        }
      />
      {count > 500 && (
        <p role="status" className="mb-5 text-sm text-primary">
          Showing the 500 most recently updated leads. Stage counts include all
          leads; use the table to search the full pipeline.
        </p>
      )}
      <div
        className="flex gap-4 overflow-x-auto pb-6"
        role="region"
        aria-label="Pipeline board"
        tabIndex={0}
      >
        {STATUSES.map((s, i) => {
          const cards = leads.filter((l) => l.status === s);
          return (
            <section
              key={s}
              className="w-72 shrink-0 rounded-lg border border-border bg-card/70"
            >
              <div className="border-b border-border p-4">
                <div className="flex items-center justify-between">
                  <span className="eyebrow text-muted-foreground">
                    /{String(i + 1).padStart(2, "0")}
                  </span>
                  <span className="rounded bg-secondary px-2 py-0.5 text-xs tabular-nums text-muted-foreground">
                    {summary.by_status[s] ?? 0}
                  </span>
                </div>
                <h2 className="mt-3 text-sm font-medium">{s}</h2>
              </div>
              <div className="min-h-72 space-y-3 p-3">
                {cards.length ? (
                  cards.map((l) => (
                    <Link
                      key={l.id}
                      href={`/dashboard/leads/${l.id}`}
                      className="block rounded-md border border-border bg-background p-4 hover:border-primary/50"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <h3 className="text-sm font-medium">
                          {l.business.name}
                        </h3>
                        <ArrowUpRight className="size-3.5 shrink-0 text-muted-foreground" />
                      </div>
                      <p className="mt-2 text-xs text-muted-foreground">
                        {l.business.industry}
                      </p>
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        {l.business.location}
                      </p>
                      <div className="mt-5 flex justify-between border-t border-border pt-3 text-[11px]">
                        <span className="text-primary">
                          {l.estimated_value_cents === null
                            ? "Value not set"
                            : money(l.estimated_value_cents)}
                        </span>
                        <span className="text-muted-foreground">
                          {l.next_follow_up ?? "No follow-up"}
                        </span>
                      </div>
                    </Link>
                  ))
                ) : (
                  <p className="rounded-md border border-dashed border-border px-3 py-8 text-center text-xs text-muted-foreground">
                    No leads in this stage.
                  </p>
                )}
              </div>
            </section>
          );
        })}
      </div>
    </>
  );
}
